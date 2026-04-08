import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { TypedEventBus } from "../../src/core/event-bus.js";
import type { RisolutoEventMap } from "../../src/core/risoluto-events.js";
import type { CodexConfig } from "../../src/core/types/codex.js";
import { CODEX_METHOD } from "../../src/codex/methods.js";

/* ------------------------------------------------------------------ */
/*  Module-level mocks                                                 */
/* ------------------------------------------------------------------ */

const mockSpawn = vi.hoisted(() => vi.fn());
const mockMkdtemp = vi.hoisted(() => vi.fn(() => Promise.resolve("/tmp/risoluto-cp-test")));
const mockWriteFile = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockCp = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockRm = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("node:fs/promises", () => ({
  mkdtemp: mockMkdtemp,
  writeFile: mockWriteFile,
  cp: mockCp,
  rm: mockRm,
}));

/* ------------------------------------------------------------------ */
/*  Import under test                                                  */
/* ------------------------------------------------------------------ */

import { CodexControlPlane, CodexControlPlaneMethodUnsupportedError } from "../../src/codex/control-plane.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeFakeChild(): ChildProcessWithoutNullStreams & EventEmitter & { killed: boolean } {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdinChunks: string[] = [];
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinChunks.push(chunk.toString());
      callback();
    },
  });
  stdin.on("error", () => {});

  const child = new EventEmitter() as ChildProcessWithoutNullStreams & EventEmitter & { killed: boolean };
  (child as unknown as Record<string, unknown>).stdout = stdout;
  (child as unknown as Record<string, unknown>).stderr = stderr;
  (child as unknown as Record<string, unknown>).stdin = stdin;
  (child as unknown as Record<string, unknown>).stdinChunks = stdinChunks;
  child.killed = false;
  (child as unknown as Record<string, unknown>).kill = vi.fn(() => {
    child.killed = true;
    child.emit("exit", 0, null);
  });
  return child;
}

function createLogger() {
  return {
    child: () => createLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };
}

function createCodexConfig(overrides: Partial<CodexConfig> = {}): CodexConfig {
  return {
    command: "codex app-server",
    readTimeoutMs: 5000,
    model: "gpt-4.1",
    auth: { mode: "api_key" as const, sourceHome: "" },
    ...overrides,
  } as CodexConfig;
}

/**
 * Auto-respond to JSON-RPC requests written to stdin.
 * Matches request IDs and responds on stdout.
 */
function autoRespondOnStdin(
  child: ChildProcessWithoutNullStreams & EventEmitter,
  handler: (method: string, params: Record<string, unknown>, id: number | string) => unknown,
): void {
  const stdin = (child as unknown as Record<string, Writable>).stdin;
  const originalWrite = stdin.write.bind(stdin);
  (stdin as unknown as Record<string, unknown>).write = (
    chunk: Buffer | string,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) => {
    const str = chunk.toString();
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    try {
      const msg = JSON.parse(str.trim());
      if (msg.method && msg.id !== undefined) {
        const result = handler(msg.method, msg.params ?? {}, msg.id);
        if (result !== undefined) {
          const response = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result });
          (child as unknown as Record<string, Readable>).stdout.push(`${response}\n`);
        }
      }
    } catch {
      // Non-JSON or notification — pass through
    }
    if (typeof encodingOrCallback === "string") {
      return originalWrite(chunk, encodingOrCallback, callback);
    }
    return originalWrite(chunk, cb as (error?: Error | null) => void);
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("CodexControlPlane", () => {
  let eventBus: TypedEventBus<RisolutoEventMap>;

  beforeEach(() => {
    eventBus = new TypedEventBus<RisolutoEventMap>();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createPlane(configOverrides: Partial<CodexConfig> = {}): CodexControlPlane {
    const config = createCodexConfig(configOverrides);
    return new CodexControlPlane(() => config, createLogger() as never, eventBus);
  }

  function setupSpawnWithAutoRespond(
    handler: (method: string, params: Record<string, unknown>, id: number | string) => unknown,
  ) {
    const child = makeFakeChild();
    autoRespondOnStdin(child, handler);
    mockSpawn.mockReturnValue(child);
    return child;
  }

  describe("config isolation", () => {
    it("spawns codex with isolated CODEX_HOME containing generated config", async () => {
      setupSpawnWithAutoRespond((method): unknown => {
        if (method === "initialize") return { capabilities: {} };
        return { data: [] };
      });

      const plane = createPlane();
      await plane.getCapabilities();

      expect(mockMkdtemp).toHaveBeenCalledOnce();
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/tmp/risoluto-cp-test/config.toml",
        expect.stringContaining("model ="),
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        "codex",
        ["app-server"],
        expect.objectContaining({
          env: expect.objectContaining({ CODEX_HOME: "/tmp/risoluto-cp-test" }),
        }),
      );
    });

    it("copies auth.json when using openai_login mode", async () => {
      setupSpawnWithAutoRespond((method): unknown => {
        if (method === "initialize") return { capabilities: {} };
        return { data: [] };
      });

      const plane = createPlane({
        auth: { mode: "openai_login" as const, sourceHome: "/home/test/.risoluto/codex-auth" },
      });
      await plane.getCapabilities();

      expect(mockCp).toHaveBeenCalledWith(
        "/home/test/.risoluto/codex-auth/auth.json",
        "/tmp/risoluto-cp-test/auth.json",
      );
    });

    it("cleans up CODEX_HOME on shutdown", async () => {
      setupSpawnWithAutoRespond((method): unknown => {
        if (method === "initialize") return { capabilities: {} };
        return { data: [] };
      });

      const plane = createPlane();
      await plane.getCapabilities();
      await plane.shutdown();

      expect(mockRm).toHaveBeenCalledWith("/tmp/risoluto-cp-test", { recursive: true, force: true });
    });
  });

  describe("getCapabilities", () => {
    it("returns initial empty registry when connection fails", async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error("spawn failed");
      });

      const plane = createPlane();
      const caps = await plane.getCapabilities();

      expect(caps.connectedAt).toBeNull();
      expect(caps.initializationError).toBeNull();
      expect(caps.methods).toEqual({});
      expect(caps.notifications).toHaveProperty("thread/archived", "enabled");
    });

    it("records connectedAt after successful initialization", async () => {
      setupSpawnWithAutoRespond((method): unknown => {
        if (method === "initialize") return { capabilities: {} };
        return { data: [] };
      });

      const plane = createPlane();
      const caps = await plane.getCapabilities();

      expect(caps.connectedAt).not.toBeNull();
      expect(caps.initializationError).toBeNull();
    });

    it("records initializationError when initialize RPC fails", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      // Never respond to initialize — let it time out
      const plane = createPlane({ readTimeoutMs: 50 });
      const caps = await plane.getCapabilities();

      expect(caps.initializationError).toMatch(/timed out/i);
      await plane.shutdown();
    });
  });

  describe("request", () => {
    it("marks method as supported on success", async () => {
      setupSpawnWithAutoRespond((method): unknown => {
        if (method === "initialize") return { capabilities: {} };
        if (method === "thread/list") return { data: [], nextCursor: null };
        return { data: [] };
      });

      const plane = createPlane();
      const result = await plane.request("thread/list", { limit: 10 });

      expect(result).toEqual({ data: [], nextCursor: null });
      const caps = await plane.getCapabilities();
      expect(caps.methods["thread/list"]).toBe("supported");
    });

    it("marks method as unsupported and throws CodexControlPlaneMethodUnsupportedError", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      autoRespondOnStdin(child, (method, _params, id): unknown => {
        if (method === "initialize") return { capabilities: {} };
        // Simulate "Method not found" error for unknown method
        const errorResponse = JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Method not found" },
        });
        (child as unknown as Record<string, Readable>).stdout.push(`${errorResponse}\n`);
        return undefined; // Don't auto-send a success response
      });

      const plane = createPlane();

      await expect(plane.request("nonexistent/method", {})).rejects.toThrow(CodexControlPlaneMethodUnsupportedError);

      const caps = await plane.getCapabilities();
      expect(caps.methods["nonexistent/method"]).toBe("unsupported");
    });

    it("re-throws generic errors without marking as unsupported", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);
      autoRespondOnStdin(child, (method, _params, id): unknown => {
        if (method === "initialize") return { capabilities: {} };
        // Return a generic error (not "Method not found")
        const errorResponse = JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "Internal server error" },
        });
        (child as unknown as Record<string, Readable>).stdout.push(`${errorResponse}\n`);
        return undefined;
      });

      const plane = createPlane();
      await expect(plane.request("thread/list", {})).rejects.toThrow("Internal server error");

      const caps = await plane.getCapabilities();
      // Generic errors should NOT mark the method as unsupported
      expect(caps.methods["thread/list"]).toBeUndefined();
    });
  });

  describe("listPendingUserInputRequests", () => {
    it("returns empty array when no requests are pending", () => {
      const plane = createPlane();
      expect(plane.listPendingUserInputRequests()).toEqual([]);
    });

    it("filters to only user-input request methods", async () => {
      setupSpawnWithAutoRespond((method): unknown => {
        if (method === "initialize") return { capabilities: {} };
        return { data: [] };
      });

      const plane = createPlane();
      await plane.getCapabilities();

      // Access internal map to simulate pending requests
      const pendingMap = (plane as unknown as Record<string, Map<string, Record<string, unknown>>>)
        .pendingServerRequests;

      pendingMap.set("req-1", {
        requestId: "req-1",
        method: CODEX_METHOD.ToolRequestUserInput,
        threadId: "thr-1",
        turnId: "turn-1",
        params: { questions: [{ id: "q1", question: "Pick a model?" }] },
        createdAt: "2026-04-08T00:00:00Z",
        resolve: vi.fn(),
      });

      pendingMap.set("req-2", {
        requestId: "req-2",
        method: "item/commandExecution/requestApproval",
        threadId: "thr-1",
        turnId: "turn-1",
        params: {},
        createdAt: "2026-04-08T00:00:01Z",
        resolve: vi.fn(),
      });

      pendingMap.set("req-3", {
        requestId: "req-3",
        method: CODEX_METHOD.ItemToolRequestUserInput,
        threadId: null,
        turnId: null,
        params: { questions: [] },
        createdAt: "2026-04-08T00:00:02Z",
        resolve: vi.fn(),
      });

      const requests = plane.listPendingUserInputRequests();
      expect(requests).toHaveLength(2);
      expect(requests[0].requestId).toBe("req-1");
      expect(requests[0].questions).toHaveLength(1);
      expect(requests[1].requestId).toBe("req-3");
    });

    it("normalizes non-array questions to empty array", async () => {
      const plane = createPlane();
      const pendingMap = (plane as unknown as Record<string, Map<string, Record<string, unknown>>>)
        .pendingServerRequests;

      pendingMap.set("req-1", {
        requestId: "req-1",
        method: CODEX_METHOD.ToolRequestUserInput,
        threadId: null,
        turnId: null,
        params: { questions: "not-an-array" },
        createdAt: "2026-04-08T00:00:00Z",
        resolve: vi.fn(),
      });

      const requests = plane.listPendingUserInputRequests();
      expect(requests[0].questions).toEqual([]);
    });
  });

  describe("respondToRequest", () => {
    it("returns false for unknown request ID", async () => {
      const plane = createPlane();
      const result = await plane.respondToRequest("nonexistent", { answer: "yes" });
      expect(result).toBe(false);
    });

    it("resolves the pending request and returns true", async () => {
      const plane = createPlane();
      const pendingMap = (plane as unknown as Record<string, Map<string, Record<string, unknown>>>)
        .pendingServerRequests;
      const resolveFn = vi.fn();

      pendingMap.set("req-1", {
        requestId: "req-1",
        method: CODEX_METHOD.ToolRequestUserInput,
        threadId: null,
        turnId: null,
        params: {},
        createdAt: "2026-04-08T00:00:00Z",
        resolve: resolveFn,
      });

      const result = await plane.respondToRequest("req-1", { answer: "yes" });
      expect(result).toBe(true);
      expect(resolveFn).toHaveBeenCalledWith({ writeResponse: true, result: { answer: "yes" } });
      expect(pendingMap.has("req-1")).toBe(false);
    });
  });

  describe("shutdown", () => {
    it("drains pending requests with writeResponse: false", async () => {
      const plane = createPlane();
      const pendingMap = (plane as unknown as Record<string, Map<string, Record<string, unknown>>>)
        .pendingServerRequests;
      const resolveFn1 = vi.fn();
      const resolveFn2 = vi.fn();

      pendingMap.set("req-1", {
        requestId: "req-1",
        method: CODEX_METHOD.ToolRequestUserInput,
        threadId: null,
        turnId: null,
        params: {},
        createdAt: "2026-04-08T00:00:00Z",
        resolve: resolveFn1,
      });
      pendingMap.set("req-2", {
        requestId: "req-2",
        method: CODEX_METHOD.ItemToolRequestUserInput,
        threadId: null,
        turnId: null,
        params: {},
        createdAt: "2026-04-08T00:00:01Z",
        resolve: resolveFn2,
      });

      await plane.shutdown();

      expect(resolveFn1).toHaveBeenCalledWith({ writeResponse: false });
      expect(resolveFn2).toHaveBeenCalledWith({ writeResponse: false });
      expect(pendingMap.size).toBe(0);
    });
  });
});

describe("CodexControlPlaneMethodUnsupportedError", () => {
  it("stores the method name", () => {
    const error = new CodexControlPlaneMethodUnsupportedError("thread/list");
    expect(error.method).toBe("thread/list");
    expect(error.name).toBe("CodexControlPlaneMethodUnsupportedError");
    expect(error.message).toContain("thread/list");
  });
});
