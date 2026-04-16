import { describe, expect, it, vi } from "vitest";

import { DefaultAttemptExecutor } from "../../src/agent-runner/attempt-executor.js";
import type { CodexRuntimePort, CodexRuntimeSession } from "../../src/agent-runner/codex-runtime-port.js";
import type { SelfReviewResult } from "../../src/agent-runner/self-review.js";
import type { RunOutcome, ServiceConfig } from "../../src/core/types.js";
import type { WorkspaceManager } from "../../src/workspace/manager.js";
import { createIssue, createModelSelection, createWorkspace } from "../orchestrator/issue-test-factories.js";
import { createMockLogger } from "../helpers.js";

function createConfig(overrides?: { selfReview?: boolean; turnTimeoutMs?: number }): ServiceConfig {
  return {
    codex: {
      selfReview: overrides?.selfReview ?? false,
      turnTimeoutMs: overrides?.turnTimeoutMs ?? 120_000,
    },
  } as ServiceConfig;
}

function createWorkspaceManager(order: string[]): WorkspaceManager {
  return {
    prepareForAttempt: vi.fn(async () => {
      order.push("prepare");
    }),
    runBeforeRun: vi.fn(async () => {
      order.push("beforeRun");
    }),
    runAfterRun: vi.fn(async () => {
      order.push("afterRun");
    }),
  } as unknown as WorkspaceManager;
}

function createInput(overrides?: Partial<Parameters<DefaultAttemptExecutor["launch"]>[0]>) {
  return {
    issue: createIssue(),
    attempt: 2,
    modelSelection: createModelSelection(),
    promptTemplate: "Fix {{ issue.identifier }}",
    workspace: createWorkspace(),
    signal: new AbortController().signal,
    onEvent: vi.fn(),
    previousThreadId: "thread-prev",
    previousPrFeedback: "Address reviewer notes",
    ...overrides,
  };
}

function createNormalOutcome(overrides?: Partial<RunOutcome>): RunOutcome {
  return {
    kind: "normal",
    errorCode: null,
    errorMessage: null,
    threadId: "thread-123",
    turnId: "turn-5",
    turnCount: 5,
    ...overrides,
  };
}

function createRuntimeSession(overrides?: Partial<CodexRuntimeSession>): CodexRuntimeSession {
  return {
    initialize: vi.fn(async () => ({ threadId: "thread-123", prompt: "rendered prompt" })),
    execute: vi.fn(async () => createNormalOutcome()),
    review: vi.fn(async () => null),
    steer: vi.fn(async () => true),
    shutdown: vi.fn(async () => undefined),
    getThreadId: vi.fn(() => "thread-123"),
    getFatalFailure: vi.fn(() => null),
    ...overrides,
  };
}

describe("DefaultAttemptExecutor", () => {
  it("runs the attempt lifecycle through the runtime boundary and emits self-review events", async () => {
    const order: string[] = [];
    const events: Array<{ event: string; message: string }> = [];
    const workspaceManager = createWorkspaceManager(order);
    const review: SelfReviewResult = { passed: false, summary: "Needs follow-up on tests" };
    const runtime = createRuntimeSession({
      initialize: vi.fn(async (input) => {
        order.push("initialize");
        expect(input.previousThreadId).toBe("thread-prev");
        expect(input.previousPrFeedback).toBe("Address reviewer notes");
        return { threadId: "thread-123", prompt: "rendered prompt" };
      }),
      execute: vi.fn(async () => {
        order.push("execute");
        return createNormalOutcome();
      }),
      review: vi.fn(async () => {
        order.push("review");
        return review;
      }),
      steer: vi.fn(async (message: string) => {
        order.push(`steer:${message}`);
        return true;
      }),
      shutdown: vi.fn(async () => {
        order.push("shutdown");
      }),
    });
    const runtimePort: CodexRuntimePort = {
      start: vi.fn(async () => {
        order.push("start");
        return runtime;
      }),
    };
    const executor = new DefaultAttemptExecutor({
      getConfig: () => createConfig({ selfReview: true, turnTimeoutMs: 400_000 }),
      workspaceManager,
      runtimePort,
      logger: createMockLogger(),
    });
    const input = createInput({
      onEvent: (event) => {
        events.push({ event: event.event, message: event.message });
      },
    });

    const activeAttempt = await executor.launch(input);

    await expect(activeAttempt.steer("Please check migrations")).resolves.toBe(true);
    await expect(activeAttempt.outcome).resolves.toEqual(createNormalOutcome());

    expect(order.slice(0, 4)).toEqual(["prepare", "beforeRun", "start", "initialize"]);
    expect(order).toContain("steer:Please check migrations");
    expect(order.slice(-3)).toEqual(["review", "shutdown", "afterRun"]);
    expect(events).toContainEqual({
      event: "self_review",
      message: "Self-review flagged issues: Needs follow-up on tests",
    });
  });

  it("emits container_failed when the runtime cannot start", async () => {
    const order: string[] = [];
    const events: Array<{ event: string; message: string; metadata?: Record<string, unknown> | null }> = [];
    const workspaceManager = createWorkspaceManager(order);
    const runtimePort: CodexRuntimePort = {
      start: vi.fn(async () => {
        throw new Error("docker socket unavailable");
      }),
    };
    const executor = new DefaultAttemptExecutor({
      getConfig: () => createConfig(),
      workspaceManager,
      runtimePort,
      logger: createMockLogger(),
    });

    await expect(
      executor.launch(
        createInput({
          onEvent: (event) => {
            events.push(event);
          },
        }),
      ),
    ).rejects.toThrow("docker socket unavailable");

    expect(order).toEqual(["prepare", "beforeRun"]);
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "container_failed",
        message: "Sandbox container failed to start",
        metadata: expect.objectContaining({
          error: "docker socket unavailable",
        }),
      }),
    );
  });

  it("maps early initialization failures to lifecycle events without executing turns", async () => {
    const order: string[] = [];
    const events: Array<{ event: string; message: string }> = [];
    const workspaceManager = createWorkspaceManager(order);
    const runtime = createRuntimeSession({
      initialize: vi.fn(async () => {
        order.push("initialize");
        return {
          kind: "failed",
          errorCode: "startup_failed",
          errorMessage: "OpenAI auth is required before the agent can start",
          threadId: null,
          turnId: null,
          turnCount: 0,
        };
      }),
      execute: vi.fn(async () => {
        order.push("execute");
        return createNormalOutcome();
      }),
      shutdown: vi.fn(async () => {
        order.push("shutdown");
      }),
    });
    const runtimePort: CodexRuntimePort = {
      start: vi.fn(async () => {
        order.push("start");
        return runtime;
      }),
    };
    const executor = new DefaultAttemptExecutor({
      getConfig: () => createConfig({ selfReview: true }),
      workspaceManager,
      runtimePort,
      logger: createMockLogger(),
    });

    const activeAttempt = await executor.launch(
      createInput({
        onEvent: (event) => {
          events.push({ event: event.event, message: event.message });
        },
      }),
    );

    await expect(activeAttempt.outcome).resolves.toMatchObject({
      kind: "failed",
      errorCode: "startup_failed",
    });

    expect(order).toEqual(["prepare", "beforeRun", "start", "initialize", "shutdown", "afterRun"]);
    expect(vi.mocked(runtime.execute)).not.toHaveBeenCalled();
    expect(events).toContainEqual({
      event: "auth_failed",
      message: "Codex authentication is required before the agent can start",
    });
  });

  it("aborts the bridged signal even when no abort reason is provided", async () => {
    const order: string[] = [];
    const workspaceManager = createWorkspaceManager(order);
    let executeSignal: AbortSignal | null = null;
    const runtime = createRuntimeSession({
      initialize: vi.fn(async () => {
        order.push("initialize");
        return { threadId: "thread-cancel", prompt: "rendered prompt" };
      }),
      execute: vi.fn(
        async (input) =>
          await new Promise<RunOutcome>((resolve) => {
            executeSignal = input.signal;
            const finish = () =>
              resolve({
                kind: "cancelled",
                errorCode: "cancelled",
                errorMessage: "worker cancelled",
                threadId: "thread-cancel",
                turnId: null,
                turnCount: 0,
              });

            if (input.signal.aborted) {
              finish();
              return;
            }

            input.signal.addEventListener("abort", finish, { once: true });
          }),
      ),
      shutdown: vi.fn(async (signal) => {
        order.push(`shutdown:${signal.aborted ? "aborted" : "active"}`);
      }),
      getThreadId: vi.fn(() => "thread-cancel"),
    });
    const runtimePort: CodexRuntimePort = {
      start: vi.fn(async () => {
        order.push("start");
        return runtime;
      }),
    };
    const executor = new DefaultAttemptExecutor({
      getConfig: () => createConfig(),
      workspaceManager,
      runtimePort,
      logger: createMockLogger(),
    });

    const activeAttempt = await executor.launch(createInput());
    activeAttempt.abort();

    await expect(activeAttempt.outcome).resolves.toMatchObject({
      kind: "cancelled",
      errorCode: "cancelled",
      threadId: "thread-cancel",
    });

    expect(executeSignal?.aborted).toBe(true);
    expect(order).toEqual(["prepare", "beforeRun", "start", "initialize", "shutdown:aborted", "afterRun"]);
  });
});
