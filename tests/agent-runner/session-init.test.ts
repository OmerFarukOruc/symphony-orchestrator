import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter, Readable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { initializeSession } from "../../src/agent-runner/session-init.js";
import { StartupTimeoutError } from "../../src/agent-runner/session-helpers.js";
import { createMockLogger } from "../helpers.js";
import { createIssue, createWorkspace, createModelSelection } from "../orchestrator/issue-test-factories.js";
import type { DockerSession } from "../../src/agent-runner/docker-session.js";
import type { ServiceConfig } from "../../src/core/types.js";

function makeMinimalConfig(): ServiceConfig {
  return {
    codex: {
      approvalPolicy: "auto-edit",
      threadSandbox: "none",
    },
  } as unknown as ServiceConfig;
}

interface CapturedEvent {
  event: string;
  message: string;
  [key: string]: unknown;
}

interface MockConnection {
  request: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
}

/**
 * Creates a fake ChildProcess whose stdout emits data on the next tick,
 * satisfying waitForStartup without needing to mock the module.
 */
function makeFakeChild(): ChildProcessWithoutNullStreams {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  (child as unknown as Record<string, unknown>).stdout = stdout;
  (child as unknown as Record<string, unknown>).stderr = stderr;
  // Emit data on next tick so waitForStartup resolves immediately
  queueMicrotask(() => stdout.push("ready"));
  return child;
}

/**
 * Creates a fake ChildProcess that never emits data, causing
 * waitForStartup to time out.
 */
function makeSilentChild(): ChildProcessWithoutNullStreams {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  (child as unknown as Record<string, unknown>).stdout = stdout;
  (child as unknown as Record<string, unknown>).stderr = stderr;
  return child;
}

function makeMockSession(overrides?: {
  inspectRunning?: () => Promise<boolean | null>;
  connection?: Partial<MockConnection>;
  child?: ChildProcessWithoutNullStreams;
}): DockerSession & { connection: MockConnection } {
  const connection: MockConnection = {
    request: vi.fn().mockResolvedValue({}),
    notify: vi.fn(),
    ...overrides?.connection,
  };

  return {
    child: overrides?.child ?? makeFakeChild(),
    connection: connection as unknown as DockerSession["connection"],
    containerName: "test-container",
    threadId: null,
    turnId: null,
    exitPromise: new Promise(() => {}),
    getFatalFailure: () => null,
    inspectRunning: overrides?.inspectRunning ?? (async () => true),
    cleanup: vi.fn(),
  } as unknown as DockerSession & { connection: MockConnection };
}

function makeLiquid(overrides?: { parse?: () => unknown; render?: () => Promise<string> }) {
  return {
    parse: overrides?.parse ?? (() => []),
    render: overrides?.render ?? (async () => "rendered prompt"),
  } as unknown as import("liquidjs").Liquid;
}

describe("initializeSession", () => {
  let events: CapturedEvent[];
  let onEvent: (event: CapturedEvent) => void;
  const logger = createMockLogger();
  const deps = { logger };

  beforeEach(() => {
    events = [];
    onEvent = (event) => events.push(event);
  });

  function makeInput(overrides?: Record<string, unknown>) {
    return {
      issue: createIssue(),
      attempt: 1,
      modelSelection: createModelSelection(),
      workspace: createWorkspace(),
      promptTemplate: "Fix {{ issue.identifier }}",
      signal: new AbortController().signal,
      onEvent,
      startupTimeoutMs: 5000,
      ...overrides,
    };
  }

  describe("happy path", () => {
    it("returns threadId and rendered prompt on success", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce({ models: [{ id: "gpt-5.4" }] }) // model/list
        .mockResolvedValueOnce({ threadId: "thread-abc" }); // thread/start

      const input = makeInput();
      const liquid = makeLiquid({ render: async () => "Fix ENG-42" });

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "thread-abc", prompt: "Fix ENG-42" });
      expect(session.threadId).toBe("thread-abc");
    });
  });

  describe("startup timeout", () => {
    it("re-throws StartupTimeoutError after emitting container_startup_timeout", async () => {
      vi.useFakeTimers();
      const session = makeMockSession({ child: makeSilentChild() });
      const input = makeInput({ startupTimeoutMs: 100 });
      const liquid = makeLiquid();

      const promise = initializeSession(session, makeMinimalConfig(), input, deps, liquid);
      vi.advanceTimersByTime(101);

      await expect(promise).rejects.toThrow(StartupTimeoutError);

      const timeoutEvent = events.find((e) => e.event === "container_startup_timeout");
      expect(timeoutEvent).toMatchObject({ event: "container_startup_timeout" });
      expect(timeoutEvent!.message).toContain("100ms");

      vi.useRealTimers();
    });

    it("re-throws non-timeout startup errors without emitting timeout event", async () => {
      const child = makeSilentChild();
      const session = makeMockSession({ child });
      const input = makeInput();
      const liquid = makeLiquid();

      const promise = initializeSession(session, makeMinimalConfig(), input, deps, liquid);
      // Simulate child exit before startup readiness
      child.emit("exit", 1);

      await expect(promise).rejects.toThrow("child exited with code 1 before startup readiness");

      const timeoutEvent = events.find((e) => e.event === "container_startup_timeout");
      expect(timeoutEvent).toBeUndefined();
    });
  });

  describe("container not running", () => {
    it("returns failed outcome with container_start_failed when inspectRunning returns false", async () => {
      const session = makeMockSession({ inspectRunning: async () => false });
      const input = makeInput();
      const liquid = makeLiquid();

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toMatchObject({
        kind: "failed",
        errorCode: "container_start_failed",
        errorMessage: "sandbox container failed to reach a running state",
        threadId: null,
        turnId: null,
        turnCount: 0,
      });
    });

    it("returns failed outcome with container_start_failed when inspectRunning throws", async () => {
      const session = makeMockSession({
        inspectRunning: async () => {
          throw new Error("docker inspect failed");
        },
      });
      const input = makeInput();
      const liquid = makeLiquid();

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toMatchObject({
        kind: "failed",
        errorCode: "container_start_failed",
        errorMessage: "docker inspect failed",
        threadId: null,
        turnId: null,
        turnCount: 0,
      });
    });
  });

  describe("auth failure", () => {
    it("returns startup_failed when auth is required but no account is present", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ authRequired: true }); // account/read

      const input = makeInput();
      const liquid = makeLiquid();

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toMatchObject({
        kind: "failed",
        errorCode: "startup_failed",
        errorMessage: expect.stringContaining("OpenAI auth is required"),
        threadId: null,
        turnId: null,
        turnCount: 0,
      });
    });
  });

  describe("template parse error", () => {
    it("returns template_parse_error when liquid.parse throws", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({}) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce({ models: [] }) // model/list
        .mockResolvedValueOnce({ threadId: "thread-1" }); // thread/start

      const liquid = makeLiquid({
        parse: () => {
          throw new Error("unexpected tag");
        },
      });

      const input = makeInput();
      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toMatchObject({
        kind: "failed",
        errorCode: "template_parse_error",
        errorMessage: "unexpected tag",
        threadId: "thread-1",
        turnId: null,
        turnCount: 0,
      });
    });
  });

  describe("template render error", () => {
    it("returns template_render_error when liquid.render throws", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({}) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce({ models: [] }) // model/list
        .mockResolvedValueOnce({ threadId: "thread-2" }); // thread/start

      const liquid = makeLiquid({
        render: async () => {
          throw new Error("undefined variable: missing");
        },
      });

      const input = makeInput();
      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toMatchObject({
        kind: "failed",
        errorCode: "template_render_error",
        errorMessage: "undefined variable: missing",
        threadId: "thread-2",
        turnId: null,
        turnCount: 0,
      });
    });
  });

  describe("rate limit preflight", () => {
    it("continues normally when rate limit read fails", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockRejectedValueOnce(new Error("rate limit unavailable")) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce({ models: [] }) // model/list
        .mockResolvedValueOnce({ threadId: "thread-3" }); // thread/start

      const liquid = makeLiquid({ render: async () => "prompt" });
      const input = makeInput();

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "thread-3", prompt: "prompt" });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining("rate limit unavailable") }),
        "rate limit preflight unavailable",
      );
    });
  });

  describe("initialize protocol params", () => {
    it("sends optOutNotificationMethods in capabilities", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "thread-init" }); // thread/start

      const input = makeInput();
      const liquid = makeLiquid({ render: async () => "prompt" });

      await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      const initCall = session.connection.request.mock.calls[0];
      expect(initCall[0]).toBe("initialize");
      expect(initCall[1]).toMatchObject({
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [
            "thread/archived",
            "thread/unarchived",
            "thread/closed",
            "serverRequest/resolved",
            "app/list/updated",
            "windowsSandbox/setupCompleted",
          ],
        },
      });
    });
  });

  describe("thread/start protocol params", () => {
    it("sends serviceName: risoluto", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "thread-svc" }); // thread/start

      const input = makeInput();
      const liquid = makeLiquid({ render: async () => "prompt" });

      await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      const threadCall = session.connection.request.mock.calls[5];
      expect(threadCall[0]).toBe("thread/start");
      expect(threadCall[1]).toMatchObject({ serviceName: "risoluto" });
    });

    it("uses personality from config instead of hardcoded value", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "thread-p" }); // thread/start

      const config = {
        codex: {
          approvalPolicy: "auto-edit",
          threadSandbox: "none",
          personality: "concise",
        },
      } as unknown as ServiceConfig;

      const input = makeInput();
      const liquid = makeLiquid({ render: async () => "prompt" });

      await initializeSession(session, config, input, deps, liquid);

      const threadCall = session.connection.request.mock.calls[5];
      expect(threadCall[0]).toBe("thread/start");
      expect(threadCall[1]).toMatchObject({ personality: "concise" });
    });
  });

  describe("thread/start failure", () => {
    it("throws when thread/start returns no thread identifier", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({}) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce({ models: [] }) // model/list
        .mockResolvedValueOnce({}); // thread/start -- no threadId

      const liquid = makeLiquid();
      const input = makeInput();

      await expect(initializeSession(session, makeMinimalConfig(), input, deps, liquid)).rejects.toThrow(
        "thread/start did not return a thread identifier",
      );
    });
  });

  describe("thread/resume", () => {
    it("resumes previous thread when previousThreadId is provided", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "resumed-thread-1" }); // thread/resume

      const liquid = makeLiquid({ render: async () => "prompt" });
      const input = makeInput({ previousThreadId: "old-thread-1" });

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "resumed-thread-1", prompt: "prompt" });
      expect(session.threadId).toBe("resumed-thread-1");
      expect(session.connection.request).toHaveBeenCalledWith("thread/resume", { threadId: "old-thread-1" });
    });

    it("falls back to thread/start when thread/resume fails", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockRejectedValueOnce(new Error("resume not supported")) // thread/resume
        .mockResolvedValueOnce({ threadId: "fresh-thread-1" }); // thread/start fallback

      const liquid = makeLiquid({ render: async () => "prompt" });
      const input = makeInput({ previousThreadId: "old-thread-1" });

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "fresh-thread-1", prompt: "prompt" });
      expect(session.threadId).toBe("fresh-thread-1");
      expect(logger.info).toHaveBeenCalledWith(
        { previousThreadId: "old-thread-1" },
        "thread/resume failed — starting fresh thread",
      );
    });

    it("skips thread/resume and goes to thread/start when no previousThreadId", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "thread-fresh" }); // thread/start

      const liquid = makeLiquid({ render: async () => "prompt" });
      const input = makeInput(); // no previousThreadId

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "thread-fresh", prompt: "prompt" });
      // Verify thread/resume was never called
      const requestCalls = session.connection.request.mock.calls;
      const resumeCall = requestCalls.find(([method]: [string]) => method === "thread/resume");
      expect(resumeCall).toBeUndefined();
    });

    it("calls thread/rollback after successful resume when rollbackLastTurn is true", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "resumed-thread-2" }) // thread/resume
        .mockResolvedValueOnce({}); // thread/rollback

      const liquid = makeLiquid({ render: async () => "prompt" });
      const input = makeInput({ previousThreadId: "old-thread-2", rollbackLastTurn: true });

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "resumed-thread-2", prompt: "prompt" });
      expect(session.connection.request).toHaveBeenCalledWith("thread/rollback", {
        threadId: "resumed-thread-2",
      });
    });

    it("continues when thread/rollback fails after resume", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({}) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "resumed-thread-3" }) // thread/resume
        .mockRejectedValueOnce(new Error("rollback unsupported")); // thread/rollback fails

      const liquid = makeLiquid({ render: async () => "prompt" });
      const input = makeInput({ previousThreadId: "old-thread-3", rollbackLastTurn: true });

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "resumed-thread-3", prompt: "prompt" });
      expect(logger.info).toHaveBeenCalledWith(
        { threadId: "resumed-thread-3" },
        "thread/rollback failed — continuing with resumed thread",
      );
    });
  });

  describe("configRequirements/read", () => {
    it("calls configRequirements/read after rate limits and continues on success", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockResolvedValueOnce({ requirements: [] }) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "thread-cr-1" }); // thread/start

      const liquid = makeLiquid({ render: async () => "prompt" });
      const input = makeInput();

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "thread-cr-1", prompt: "prompt" });
      expect(session.connection.request).toHaveBeenCalledWith("configRequirements/read", {});
    });

    it("continues silently when configRequirements/read fails", async () => {
      const session = makeMockSession();
      session.connection.request
        .mockResolvedValueOnce({}) // initialize
        .mockResolvedValueOnce({ status: "authenticated" }) // account/read
        .mockResolvedValueOnce({ rateLimits: [] }) // account/rateLimits/read
        .mockRejectedValueOnce(new Error("not supported")) // configRequirements/read
        .mockResolvedValueOnce(null) // model/list
        .mockResolvedValueOnce({ threadId: "thread-cr-2" }); // thread/start

      const liquid = makeLiquid({ render: async () => "prompt" });
      const input = makeInput();

      const result = await initializeSession(session, makeMinimalConfig(), input, deps, liquid);

      expect(result).toEqual({ threadId: "thread-cr-2", prompt: "prompt" });
    });
  });
});
