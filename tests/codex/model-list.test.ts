import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

/* ------------------------------------------------------------------ */
/*  Module-level mocks                                                 */
/* ------------------------------------------------------------------ */

const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

/* ------------------------------------------------------------------ */
/*  Import under test                                                  */
/* ------------------------------------------------------------------ */
import { fetchCodexModels } from "../../src/codex/model-list.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a JSON-RPC response line for model/list. */
function rpcResponse(models: Array<{ id: string; displayName: string; hidden: boolean; isDefault: boolean }>): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { data: models },
  });
}

const SAMPLE_MODELS = [
  { id: "gpt-5.4", displayName: "GPT 5.4", hidden: false, isDefault: true },
  { id: "gpt-4.1-mini", displayName: "GPT 4.1 Mini", hidden: false, isDefault: false },
  { id: "internal-debug", displayName: "Debug Model", hidden: true, isDefault: false },
];

/**
 * Creates a fake ChildProcess with controllable stdout/stderr/stdin streams.
 * Emit data on stdout to simulate codex binary output.
 */
function makeFakeChild(): ChildProcessWithoutNullStreams & EventEmitter & { killed: boolean } {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  // Suppress EPIPE on stdin when child exits
  stdin.on("error", () => {});

  const child = new EventEmitter() as ChildProcessWithoutNullStreams & EventEmitter & { killed: boolean };
  (child as unknown as Record<string, unknown>).stdout = stdout;
  (child as unknown as Record<string, unknown>).stderr = stderr;
  (child as unknown as Record<string, unknown>).stdin = stdin;
  child.killed = false;
  (child as unknown as Record<string, unknown>).kill = vi.fn(() => {
    child.killed = true;
  });
  return child;
}

/**
 * Reset the module-level cache between tests by re-importing.
 * We use vi.resetModules() + dynamic import to get a fresh module instance.
 */
async function freshFetchCodexModels(): Promise<typeof fetchCodexModels> {
  vi.resetModules();

  // Re-apply the child_process mock after module reset
  vi.doMock("node:child_process", () => ({
    spawn: mockSpawn,
  }));

  const mod = await import("../../src/codex/model-list.js");
  return mod.fetchCodexModels;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("fetchCodexModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("successful spawn", () => {
    it("parses JSON-RPC response and returns non-hidden models", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      // Simulate codex responding with model list
      child.stdout.push(rpcResponse(SAMPLE_MODELS) + "\n");

      const result = await promise;

      expect(result).toEqual([
        { id: "gpt-5.4", displayName: "GPT 5.4", isDefault: true },
        { id: "gpt-4.1-mini", displayName: "GPT 4.1 Mini", isDefault: false },
      ]);
      // Hidden model filtered out
      expect(result.find((m) => m.id === "internal-debug")).toBeUndefined();
    });

    it("each entry has id, displayName, and isDefault properties", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      child.stdout.push(rpcResponse(SAMPLE_MODELS) + "\n");

      const result = await promise;
      for (const entry of result) {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("displayName");
        expect(entry).toHaveProperty("isDefault");
        expect(typeof entry.id).toBe("string");
        expect(typeof entry.displayName).toBe("string");
        expect(typeof entry.isDefault).toBe("boolean");
      }
    });

    it("handles response split across multiple stdout chunks", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      const fullLine = rpcResponse(SAMPLE_MODELS) + "\n";
      const mid = Math.floor(fullLine.length / 2);

      // Send the response in two chunks
      child.stdout.push(fullLine.slice(0, mid));
      child.stdout.push(fullLine.slice(mid));

      const result = await promise;
      expect(result).toHaveLength(2);
    });
  });

  describe("API key passthrough", () => {
    it("passes apiKey as OPENAI_API_KEY in the spawn environment", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn("sk-test-key-123");

      child.stdout.push(rpcResponse(SAMPLE_MODELS) + "\n");
      await promise;

      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toBe("codex");
      expect(spawnCall[1]).toEqual(["app-server"]);
      expect(spawnCall[2].env.OPENAI_API_KEY).toBe("sk-test-key-123");
    });

    it("does not set OPENAI_API_KEY when apiKey is omitted", async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      child.stdout.push(rpcResponse(SAMPLE_MODELS) + "\n");
      await promise;

      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[2].env.OPENAI_API_KEY).toBeUndefined();

      // Restore
      if (originalKey !== undefined) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    });
  });

  describe("ENOENT fallback", () => {
    it("falls back to static model list when codex binary is not found", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      // Simulate ENOENT error
      const error = new Error("spawn codex ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      child.emit("error", error);

      const result = await promise;

      // Should return static list — every entry has the expected shape
      expect(result.length).toBeGreaterThan(0);
      for (const entry of result) {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("displayName");
        expect(entry).toHaveProperty("isDefault", false);
        // In fallback, displayName equals id
        expect(entry.displayName).toBe(entry.id);
      }
    });
  });

  describe("timeout fallback", () => {
    it("falls back to static model list when codex takes too long", async () => {
      vi.useFakeTimers();
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      // Advance past the 15s timeout
      vi.advanceTimersByTime(16_000);

      const result = await promise;

      expect(result.length).toBeGreaterThan(0);
      for (const entry of result) {
        expect(entry.displayName).toBe(entry.id);
        expect(entry.isDefault).toBe(false);
      }
    });
  });

  describe("process exit fallback", () => {
    it("falls back to static list when codex exits with non-zero code", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      child.emit("exit", 1);

      const result = await promise;
      expect(result.length).toBeGreaterThan(0);
      for (const entry of result) {
        expect(entry.displayName).toBe(entry.id);
      }
    });
  });

  describe("caching", () => {
    it("returns cached result on second call within TTL", async () => {
      vi.useFakeTimers();

      const child1 = makeFakeChild();
      mockSpawn.mockReturnValue(child1);

      const fetchFn = await freshFetchCodexModels();

      // First call — real spawn
      const promise1 = fetchFn();
      child1.stdout.push(rpcResponse(SAMPLE_MODELS) + "\n");
      const result1 = await promise1;

      // Advance less than 5 minutes
      vi.advanceTimersByTime(2 * 60 * 1000);

      // Second call — should use cache, no new spawn
      mockSpawn.mockClear();
      const result2 = await fetchFn();

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(result2).toEqual(result1);
    });

    it("re-queries after cache TTL expires", async () => {
      vi.useFakeTimers();

      const child1 = makeFakeChild();
      mockSpawn.mockReturnValue(child1);

      const fetchFn = await freshFetchCodexModels();

      // First call
      const promise1 = fetchFn();
      child1.stdout.push(rpcResponse(SAMPLE_MODELS) + "\n");
      await promise1;

      // Advance past 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Second call — cache expired, should spawn again
      const child2 = makeFakeChild();
      mockSpawn.mockClear();
      mockSpawn.mockReturnValue(child2);

      const promise2 = fetchFn();
      const updatedModels = [{ id: "gpt-6.0", displayName: "GPT 6.0", hidden: false, isDefault: true }];
      child2.stdout.push(rpcResponse(updatedModels) + "\n");

      const result2 = await promise2;

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(result2).toEqual([{ id: "gpt-6.0", displayName: "GPT 6.0", isDefault: true }]);
    });
  });

  describe("non-JSON lines", () => {
    it("ignores non-JSON stdout lines and waits for valid RPC response", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      // Send garbage, then the real response
      child.stdout.push("Starting codex server...\n");
      child.stdout.push("Loading models...\n");
      child.stdout.push(rpcResponse(SAMPLE_MODELS) + "\n");

      const result = await promise;
      expect(result).toHaveLength(2);
    });

    it("ignores JSON lines that are not the expected RPC response", async () => {
      const child = makeFakeChild();
      mockSpawn.mockReturnValue(child);

      const fetchFn = await freshFetchCodexModels();
      const promise = fetchFn();

      // Send a JSON notification (no matching id)
      child.stdout.push(JSON.stringify({ jsonrpc: "2.0", method: "notify", params: {} }) + "\n");
      // Then the real response
      child.stdout.push(rpcResponse(SAMPLE_MODELS) + "\n");

      const result = await promise;
      expect(result).toHaveLength(2);
    });
  });
});
