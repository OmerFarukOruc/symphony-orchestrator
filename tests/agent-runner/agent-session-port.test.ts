import { describe, expect, it, vi } from "vitest";

import { AgentRunner } from "../../src/agent-runner/index.js";
import type { AgentSession, AgentSessionPort } from "../../src/agent-runner/session-port.js";
import { createIssue, createModelSelection, createWorkspace } from "../orchestrator/issue-test-factories.js";
import { buildStubTracker } from "../helpers/http-server-harness.js";
import { createMockLogger } from "../helpers.js";
import { NullTrackerToolProvider } from "../../src/tracker/tool-provider.js";

function createSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    initialize: vi.fn(async () => ({ threadId: "thread-1", prompt: "rendered prompt" })),
    execute: vi.fn(async () => ({
      kind: "normal",
      errorCode: null,
      errorMessage: null,
      threadId: "thread-1",
      turnId: "turn-1",
      turnCount: 1,
    })),
    review: vi.fn(async () => null),
    steer: vi.fn(async () => true),
    shutdown: vi.fn(async () => undefined),
    getThreadId: vi.fn(() => "thread-1"),
    getFatalFailure: vi.fn(() => null),
    ...overrides,
  };
}

function createSessionPort(session: AgentSession): AgentSessionPort {
  return {
    start: vi.fn(async () => session),
  };
}

describe("AgentSessionPort", () => {
  it("lets AgentRunner expose steering without any Docker-specific dependency in the caller contract", async () => {
    const session = createSession();
    const sessionPort = createSessionPort(session);
    const runAfterRun = vi.fn(async () => undefined);
    const runner = new AgentRunner({
      getConfig: () =>
        ({
          agent: { maxConcurrentAgents: 1, maxConcurrentAgentsByState: {}, maxTurns: 2, maxRetryBackoffMs: 1 },
          codex: { selfReview: false, turnTimeoutMs: 1000 },
        }) as never,
      tracker: buildStubTracker(),
      trackerToolProvider: new NullTrackerToolProvider(),
      workspaceManager: {
        prepareForAttempt: vi.fn(async () => undefined),
        runBeforeRun: vi.fn(async () => undefined),
        runAfterRun,
      } as never,
      logger: createMockLogger(),
      sessionPort,
    });

    let steerFn: ((message: string) => Promise<boolean>) | undefined;
    const outcome = await runner.runAttempt({
      issue: createIssue(),
      attempt: 1,
      modelSelection: createModelSelection(),
      promptTemplate: "Fix {{ issue.identifier }}",
      workspace: createWorkspace(),
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      onSteerReady: (steer) => {
        steerFn = steer;
      },
    });

    expect(outcome).toMatchObject({ kind: "normal", threadId: "thread-1" });
    expect(sessionPort.start).toHaveBeenCalledTimes(1);
    expect(typeof steerFn).toBe("function");
    await expect(steerFn?.("Please retry with more detail")).resolves.toBe(true);
    expect(session.steer).toHaveBeenCalledWith("Please retry with more detail");
    expect(runAfterRun).toHaveBeenCalledTimes(1);
  });
});
