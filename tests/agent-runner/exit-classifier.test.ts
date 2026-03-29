import { describe, expect, it, vi } from "vitest";

import { classifyExitState } from "../../src/agent-runner/exit-classifier.js";

// Mock docker/lifecycle to control inspectOomKilled
vi.mock("../../src/docker/lifecycle.js", () => ({
  inspectOomKilled: vi.fn().mockResolvedValue(false),
}));

import { inspectOomKilled } from "../../src/docker/lifecycle.js";

function makeInput(aborted = false): Parameters<typeof classifyExitState>[0] {
  const controller = new AbortController();
  if (aborted) {
    controller.abort("shutdown");
  }
  return {
    runInput: {
      signal: controller.signal,
    },
    config: {
      codex: {
        sandbox: { resources: { memory: "4g" } },
      },
    },
  } as unknown as Parameters<typeof classifyExitState>[0];
}

function makeState(
  overrides: {
    exitCode?: number | null;
    exitSignal?: string | null;
    fatalFailure?: { code: string; message: string } | null;
    containerName?: string | null;
  } = {},
): Parameters<typeof classifyExitState>[1] {
  const { exitCode = null, exitSignal = null, fatalFailure = null, containerName = null } = overrides;
  return {
    exitPromise: Promise.resolve({ code: exitCode, signal: exitSignal }),
    getFatalFailure: vi.fn().mockReturnValue(fatalFailure),
    containerName,
    threadId: "thread-1",
    turnId: "turn-1",
    turnCount: 2,
  } as unknown as Parameters<typeof classifyExitState>[1];
}

describe("classifyExitState", () => {
  it("returns normal outcome when exit code is null and not aborted", async () => {
    const result = await classifyExitState(makeInput(), makeState({ exitCode: null }));
    expect(result.kind).toBe("normal");
    expect(result.errorCode).toBe(null);
  });

  it("returns port_exit for non-137 non-null exit codes", async () => {
    const result = await classifyExitState(makeInput(), makeState({ exitCode: 1 }));
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("port_exit");
    expect(result.errorMessage).toContain("1");
  });

  it("returns port_exit for exit code 137 when not OOM killed", async () => {
    vi.mocked(inspectOomKilled).mockResolvedValueOnce(false);
    const result = await classifyExitState(makeInput(), makeState({ exitCode: 137, containerName: "container-abc" }));
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("port_exit");
  });

  it("returns container_oom for exit code 137 when OOM killed", async () => {
    vi.mocked(inspectOomKilled).mockResolvedValueOnce(true);
    const result = await classifyExitState(makeInput(), makeState({ exitCode: 137, containerName: "container-abc" }));
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("container_oom");
    expect(result.errorMessage).toContain("4g");
  });

  it("does not check OOM when containerName is null (exit 137)", async () => {
    const inspectMock = vi.mocked(inspectOomKilled);
    inspectMock.mockClear();
    const result = await classifyExitState(makeInput(), makeState({ exitCode: 137, containerName: null }));
    expect(inspectMock).not.toHaveBeenCalled();
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("port_exit");
  });

  it("returns normal when exit code is non-null but signal is aborted", async () => {
    // When signal is aborted, exit code check is skipped
    const result = await classifyExitState(makeInput(true), makeState({ exitCode: 1 }));
    expect(result.kind).toBe("normal");
    expect(result.errorCode).toBe(null);
  });

  it("prioritizes fatal failure over exit code", async () => {
    const state = makeState({
      exitCode: 1,
      fatalFailure: { code: "mcp_error", message: "MCP crashed" },
    });
    const result = await classifyExitState(makeInput(), state);
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("mcp_error");
    expect(result.errorMessage).toBe("MCP crashed");
  });

  it("includes threadId and turnId in result", async () => {
    const state = makeState({ exitCode: null });
    const result = await classifyExitState(makeInput(), state);
    expect(result.threadId).toBe("thread-1");
    expect(result.turnId).toBe("turn-1");
    expect(result.turnCount).toBe(2);
  });

  it("returns port_exit (not OOM) for non-137 exit codes even with containerName", async () => {
    // Kills: ConditionalExpression exit-classifier.ts:21 exitState.code === 137 -> true
    // Verifying that only exit code 137 triggers the OOM check
    const inspectMock = vi.mocked(inspectOomKilled);
    inspectMock.mockClear();
    const result = await classifyExitState(makeInput(), makeState({ exitCode: 1, containerName: "container-abc" }));
    expect(result.kind).toBe("failed");
    expect(result.errorCode).toBe("port_exit");
    expect(result.errorMessage).toContain("1");
    // inspectOomKilled should NOT have been called for non-137 exit codes
    expect(inspectMock).not.toHaveBeenCalled();
  });
});
