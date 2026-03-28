import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter, Readable, Writable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { createMockLogger } from "../helpers.js";
import { createIssue, createWorkspace, createModelSelection } from "../orchestrator/issue-test-factories.js";
import type { ServiceConfig } from "../../src/core/types.js";

// ── Hoisted mocks (available inside vi.mock factories) ───────────────────

const {
  mockMkdir,
  mockBuildDockerRunArgs,
  mockBuildInitCacheVolumeArgs,
  mockResolveWorkspaceExtraMountPaths,
  mockPrepareCodexRuntimeConfig,
  mockGetRequiredProviderEnvNames,
  mockStopContainer,
  mockRemoveContainer,
  mockRemoveVolume,
  mockGetContainerStats,
  mockHandleCodexRequest,
  mockHandleNotification,
  mockGlobalMetrics,
  mockRealSpawn,
} = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockBuildDockerRunArgs: vi.fn(),
  mockBuildInitCacheVolumeArgs: vi.fn(),
  mockResolveWorkspaceExtraMountPaths: vi.fn(),
  mockPrepareCodexRuntimeConfig: vi.fn(),
  mockGetRequiredProviderEnvNames: vi.fn(),
  mockStopContainer: vi.fn(),
  mockRemoveContainer: vi.fn(),
  mockRemoveVolume: vi.fn(),
  mockGetContainerStats: vi.fn(),
  mockHandleCodexRequest: vi.fn(),
  mockHandleNotification: vi.fn(),
  mockGlobalMetrics: {
    containerCpuPercent: { set: vi.fn() },
    containerMemoryPercent: { set: vi.fn() },
  },
  mockRealSpawn: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock("node:fs/promises", () => ({ mkdir: mockMkdir }));

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, spawn: mockRealSpawn };
});

vi.mock("../../src/docker/spawn.js", () => ({
  buildDockerRunArgs: mockBuildDockerRunArgs,
  buildInitCacheVolumeArgs: mockBuildInitCacheVolumeArgs,
}));

vi.mock("../../src/docker/workspace-mounts.js", () => ({
  resolveWorkspaceExtraMountPaths: mockResolveWorkspaceExtraMountPaths,
}));

vi.mock("../../src/codex/runtime-config.js", () => ({
  prepareCodexRuntimeConfig: mockPrepareCodexRuntimeConfig,
  getRequiredProviderEnvNames: mockGetRequiredProviderEnvNames,
}));

vi.mock("../../src/docker/lifecycle.js", () => ({
  inspectContainerRunning: vi.fn().mockResolvedValue(true),
  stopContainer: mockStopContainer,
  removeContainer: mockRemoveContainer,
  removeVolume: mockRemoveVolume,
}));

vi.mock("../../src/docker/stats.js", () => ({
  getContainerStats: mockGetContainerStats,
}));

vi.mock("../../src/agent/codex-request-handler.js", () => ({
  handleCodexRequest: mockHandleCodexRequest,
}));

vi.mock("../../src/agent-runner/notification-handler.js", () => ({
  handleNotification: mockHandleNotification,
}));

vi.mock("../../src/observability/metrics.js", () => ({
  globalMetrics: mockGlobalMetrics,
}));

vi.mock("../../src/agent/json-rpc-connection.js", () => ({
  JsonRpcConnection: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.request = vi.fn().mockResolvedValue({});
    this.notify = vi.fn();
    this.close = vi.fn();
    this.interruptTurn = vi.fn().mockResolvedValue(false);
    this.exited = false;
  }),
}));

vi.mock("../../src/core/lifecycle-events.js", () => ({
  createLifecycleEvent: vi.fn().mockImplementation((input: Record<string, unknown>) => {
    const issue = input.issue as { id: string; identifier: string };
    return {
      at: new Date().toISOString(),
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      sessionId: null,
      event: input.event,
      message: input.message,
      metadata: input.metadata ?? null,
    };
  }),
}));

import { createDockerSession } from "../../src/agent-runner/docker-session.js";
import { createTurnState } from "../../src/agent-runner/turn-state.js";
import type { DockerSessionDeps } from "../../src/agent-runner/docker-session.js";

// ── Helpers ──────────────────────────────────────────────────────────────

const DEFAULT_DOCKER_RUN_RESULT = {
  program: "docker",
  args: ["run", "-i", "--name", "symphony-MT-42-1234"],
  containerName: "symphony-MT-42-1234",
  cacheVolumeName: "symphony-cache-MT-42-1234",
};

function makeMinimalConfig(): ServiceConfig {
  return {
    codex: {
      command: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "auto-edit",
      threadSandbox: "none",
      readTimeoutMs: 30000,
      turnTimeoutMs: 300000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 30000,
      stallTimeoutMs: 120000,
      sandbox: {
        image: "symphony-sandbox:latest",
        resources: { memory: "4g", memoryReservation: "2g", memorySwap: "4g", cpus: "2", tmpfsSize: "1g" },
        envPassthrough: [],
        extraMounts: [],
        egressAllowlist: [],
        logs: { driver: "json-file", maxSize: "10m", maxFile: "3" },
        security: {},
      },
    },
  } as unknown as ServiceConfig;
}

/**
 * Creates a fake ChildProcess that emits "exit" with code 0 on the next microtask.
 * Used for the init container spawn.
 */
function makeFakeInitChild(exitCode = 0): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  (child as unknown as Record<string, unknown>).stdout = stdout;
  (child as unknown as Record<string, unknown>).stderr = stderr;
  (child as unknown as Record<string, unknown>).stdin = stdin;
  (child as unknown as Record<string, unknown>).pid = 12345;
  queueMicrotask(() => child.emit("exit", exitCode));
  return child;
}

/** Creates a fake ChildProcess for the main container (does NOT auto-exit). */
function makeFakeMainChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  (child as unknown as Record<string, unknown>).stdout = stdout;
  (child as unknown as Record<string, unknown>).stderr = stderr;
  (child as unknown as Record<string, unknown>).stdin = stdin;
  (child as unknown as Record<string, unknown>).pid = 54321;
  return child;
}

function makeInput(overrides?: Record<string, unknown>) {
  return {
    issue: createIssue(),
    modelSelection: createModelSelection(),
    workspace: createWorkspace(),
    signal: new AbortController().signal,
    onEvent: vi.fn(),
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<DockerSessionDeps>): DockerSessionDeps {
  return {
    logger: createMockLogger(),
    linearClient: null,
    archiveDir: "/tmp/test-archive",
    spawnProcess: vi.fn().mockReturnValue(makeFakeMainChild()),
    ...overrides,
  };
}

/** Resets all hoisted mocks to their expected default return values. */
function resetMockDefaults(): void {
  mockMkdir.mockReset().mockResolvedValue(undefined);
  mockBuildDockerRunArgs.mockReset().mockReturnValue({ ...DEFAULT_DOCKER_RUN_RESULT });
  mockBuildInitCacheVolumeArgs.mockReset().mockReturnValue({
    program: "docker",
    args: ["run", "--rm", "-v", "symphony-cache-MT-42-1234:/mnt", "alpine:3.21", "chown", "1000:1000", "/mnt"],
  });
  mockResolveWorkspaceExtraMountPaths.mockReset().mockResolvedValue([]);
  mockPrepareCodexRuntimeConfig.mockReset().mockResolvedValue({
    configToml: "mock-config",
    authJsonBase64: null,
  });
  mockGetRequiredProviderEnvNames.mockReset().mockReturnValue([]);
  mockStopContainer.mockReset().mockResolvedValue(undefined);
  mockRemoveContainer.mockReset().mockResolvedValue(undefined);
  mockRemoveVolume.mockReset().mockResolvedValue(undefined);
  mockGetContainerStats.mockReset().mockResolvedValue(null);
  mockHandleCodexRequest.mockReset().mockResolvedValue({ response: {} });
  mockHandleNotification.mockReset();
  mockGlobalMetrics.containerCpuPercent.set.mockReset();
  mockGlobalMetrics.containerMemoryPercent.set.mockReset();
  mockRealSpawn.mockReset().mockImplementation(() => makeFakeInitChild());
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("createDockerSession", () => {
  beforeEach(() => {
    resetMockDefaults();
  });

  describe("session creation — happy path", () => {
    it("creates archive directory with recursive flag", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      expect(mockMkdir).toHaveBeenCalledWith("/tmp/test-archive", { recursive: true });
    });

    it("emits container_starting lifecycle event", async () => {
      const config = makeMinimalConfig();
      const onEvent = vi.fn();
      const input = makeInput({ onEvent });
      const deps = makeDeps();
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "container_starting",
          message: "Starting sandbox container",
        }),
      );
    });

    it("returns a session object with expected properties", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);

      expect(session).toMatchObject({
        containerName: "symphony-MT-42-1234",
        threadId: null,
        turnId: null,
      });
      expect(session.child).toBeDefined();
      expect(session.connection).toBeDefined();
      expect(typeof session.cleanup).toBe("function");
      expect(typeof session.getFatalFailure).toBe("function");
      expect(typeof session.inspectRunning).toBe("function");
      expect(typeof session.steerTurn).toBe("function");
      expect(session.exitPromise).toBeInstanceOf(Promise);
    });

    it("uses precomputed runtime config when provided", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();
      const precomputed = { configToml: "precomputed-toml", authJsonBase64: "abc123" };

      await createDockerSession(config, input, deps, turnState, precomputed);

      expect(mockPrepareCodexRuntimeConfig).not.toHaveBeenCalled();
      expect(mockBuildDockerRunArgs).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeConfigToml: "precomputed-toml",
          runtimeAuthJsonBase64: "abc123",
        }),
      );
    });

    it("falls back to prepareCodexRuntimeConfig when no precomputed config", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      expect(mockPrepareCodexRuntimeConfig).toHaveBeenCalledWith(config.codex);
    });

    it("uses default archive directory when none provided in deps", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps({ archiveDir: undefined });
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining("archive"), { recursive: true });
    });

    it("spawns init container before main container", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      // Init container uses the real spawn (mockRealSpawn)
      expect(mockRealSpawn).toHaveBeenCalledWith("docker", expect.arrayContaining(["run", "--rm"]), { stdio: "pipe" });
      // Main container uses the injected spawnProcess
      expect(deps.spawnProcess).toHaveBeenCalledWith(
        "docker",
        expect.arrayContaining(["run", "-i", "--name", "symphony-MT-42-1234"]),
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
      );
    });

    it("passes correct args to buildDockerRunArgs", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      expect(mockBuildDockerRunArgs).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxConfig: config.codex.sandbox,
          command: "codex",
          workspacePath: "/tmp/symphony/MT-42",
          archiveDir: "/tmp/test-archive",
        }),
      );
    });
  });

  describe("init container failure", () => {
    it("rejects when init container exits with non-zero code", async () => {
      mockRealSpawn.mockImplementation(() => makeFakeInitChild(1));

      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      await expect(createDockerSession(config, input, deps, turnState)).rejects.toThrow(
        "Cache volume init failed with exit code 1",
      );
    });

    it("rejects when init container spawn emits error", async () => {
      mockRealSpawn.mockImplementation(() => {
        const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
        (child as unknown as Record<string, unknown>).stdout = new Readable({ read() {} });
        (child as unknown as Record<string, unknown>).stderr = new Readable({ read() {} });
        queueMicrotask(() => child.emit("error", new Error("docker not found")));
        return child;
      });

      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      await expect(createDockerSession(config, input, deps, turnState)).rejects.toThrow("docker not found");
    });
  });

  describe("abort signal wiring", () => {
    it("registers abort handler on the input signal", async () => {
      const controller = new AbortController();
      const addEventSpy = vi.spyOn(controller.signal, "addEventListener");
      const config = makeMinimalConfig();
      const input = makeInput({ signal: controller.signal });
      const deps = makeDeps();
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      expect(addEventSpy).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    });
  });

  describe("exitPromise", () => {
    it("resolves with code and signal when child exits", async () => {
      const mainChild = makeFakeMainChild();
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps({ spawnProcess: vi.fn().mockReturnValue(mainChild) });
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);

      mainChild.emit("exit", 0, null);
      const result = await session.exitPromise;

      expect(result).toEqual({ code: 0, signal: null });
    });

    it("captures signal when child is killed", async () => {
      const mainChild = makeFakeMainChild();
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps({ spawnProcess: vi.fn().mockReturnValue(mainChild) });
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);

      mainChild.emit("exit", null, "SIGKILL");
      const result = await session.exitPromise;

      expect(result).toEqual({ code: null, signal: "SIGKILL" });
    });
  });

  describe("getFatalFailure", () => {
    it("returns null when no fatal failure has occurred", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);

      expect(session.getFatalFailure()).toBeNull();
    });
  });

  describe("inspectRunning", () => {
    it("returns true when custom spawnProcess is injected", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps(); // has custom spawnProcess, so inspectRunning => async true
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);
      const result = await session.inspectRunning();

      expect(result).toBe(true);
    });
  });

  describe("steerTurn", () => {
    it("returns false when threadId or turnId is not set", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);
      const result = await session.steerTurn("Please focus on tests");

      expect(result).toBe(false);
    });

    it("sends turn/steer request when threadId and turnId are set", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);
      session.threadId = "thread-abc";
      session.turnId = "turn-123";

      const result = await session.steerTurn("Please focus on tests");

      expect(result).toBe(true);
      expect(session.connection.request).toHaveBeenCalledWith("turn/steer", {
        threadId: "thread-abc",
        turnId: "turn-123",
        message: "Please focus on tests",
      });
    });

    it("returns false when connection request throws", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);
      session.threadId = "thread-abc";
      session.turnId = "turn-123";
      vi.mocked(session.connection.request).mockRejectedValueOnce(new Error("connection closed"));

      const result = await session.steerTurn("steer message");

      expect(result).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("closes connection, stops container, removes container and volume", async () => {
      const config = makeMinimalConfig();
      const mainChild = makeFakeMainChild();
      const input = makeInput();
      const deps = makeDeps({ spawnProcess: vi.fn().mockReturnValue(mainChild) });
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);

      // Resolve exitPromise so cleanup does not wait the full 5s race
      queueMicrotask(() => mainChild.emit("exit", 0, null));

      await session.cleanup(config, new AbortController().signal);

      expect(session.connection.close).toHaveBeenCalled();
      expect(mockStopContainer).toHaveBeenCalledWith("symphony-MT-42-1234", 5);
      expect(mockRemoveContainer).toHaveBeenCalledWith("symphony-MT-42-1234");
      expect(mockRemoveVolume).toHaveBeenCalledWith("symphony-cache-MT-42-1234");
    });

    it("removes abort handler from signal during cleanup", async () => {
      const controller = new AbortController();
      const config = makeMinimalConfig();
      const mainChild = makeFakeMainChild();
      const input = makeInput({ signal: controller.signal });
      const deps = makeDeps({ spawnProcess: vi.fn().mockReturnValue(mainChild) });
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);

      // The cleanup signal should have removeEventListener called on it
      const cleanupSignal = new AbortController().signal;
      const removeEventSpy = vi.spyOn(cleanupSignal, "removeEventListener");
      queueMicrotask(() => mainChild.emit("exit", 0, null));
      await session.cleanup(config, cleanupSignal);

      expect(removeEventSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    });

    it("waits drainTimeoutMs when signal is not aborted and drain > 0", async () => {
      vi.useFakeTimers();

      const config = makeMinimalConfig();
      (config.codex as { drainTimeoutMs: number }).drainTimeoutMs = 500;
      const mainChild = makeFakeMainChild();
      const input = makeInput();
      const deps = makeDeps({ spawnProcess: vi.fn().mockReturnValue(mainChild) });
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);
      const cleanupPromise = session.cleanup(config, new AbortController().signal);

      // Advance past drain timeout + exit wait timeout
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(5000);

      await cleanupPromise;
      expect(mockStopContainer).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("skips drain wait when cleanup signal is already aborted", async () => {
      const config = makeMinimalConfig();
      (config.codex as { drainTimeoutMs: number }).drainTimeoutMs = 5000;
      const mainChild = makeFakeMainChild();
      const input = makeInput();
      const deps = makeDeps({ spawnProcess: vi.fn().mockReturnValue(mainChild) });
      const turnState = createTurnState();

      const session = await createDockerSession(config, input, deps, turnState);

      const abortedController = new AbortController();
      abortedController.abort();
      queueMicrotask(() => mainChild.emit("exit", 0, null));

      // Should not hang for 5000ms because signal.aborted is true
      await session.cleanup(config, abortedController.signal);
      expect(mockStopContainer).toHaveBeenCalled();
    });
  });

  describe("container name generation", () => {
    it("builds container name from issue identifier and timestamp via buildDockerRunArgs", async () => {
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      expect(mockBuildDockerRunArgs).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: expect.stringMatching(/^MT-42-\d+$/),
        }),
      );
    });
  });

  describe("connection setup", () => {
    it("creates JsonRpcConnection with child, logger, and timeout", async () => {
      const { JsonRpcConnection: rpcMock } = await import("../../src/agent/json-rpc-connection.js");
      const config = makeMinimalConfig();
      const input = makeInput();
      const deps = makeDeps();
      const turnState = createTurnState();

      await createDockerSession(config, input, deps, turnState);

      expect(rpcMock).toHaveBeenCalledWith(
        expect.anything(), // child
        expect.anything(), // logger (child logger)
        30000, // readTimeoutMs
        expect.any(Function), // onRequest callback
        expect.any(Function), // onNotification callback
      );
    });
  });
});

describe("stats polling", () => {
  beforeEach(() => {
    resetMockDefaults();
  });

  it("records metrics when stats are available", async () => {
    vi.useFakeTimers();

    mockGetContainerStats.mockResolvedValue({
      cpuPercent: "42.5%",
      memoryUsage: "512MiB",
      memoryLimit: "4GiB",
      memoryPercent: "12.5%",
      netIO: "100MB / 50MB",
      pids: "10",
    });

    const config = makeMinimalConfig();
    const onEvent = vi.fn();
    const input = makeInput({ onEvent });
    const deps = makeDeps();
    const turnState = createTurnState();

    const session = await createDockerSession(config, input, deps, turnState);

    // Advance past the 30s stats polling interval
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockGetContainerStats).toHaveBeenCalledWith("symphony-MT-42-1234");
    expect(mockGlobalMetrics.containerCpuPercent.set).toHaveBeenCalledWith(42.5, { issue: "MT-42" });
    expect(mockGlobalMetrics.containerMemoryPercent.set).toHaveBeenCalledWith(12.5, { issue: "MT-42" });

    // Verify container_stats event was emitted
    const statsEvent = onEvent.mock.calls.find(
      (call: unknown[]) => (call[0] as { event: string }).event === "container_stats",
    );
    expect(statsEvent).toBeDefined();

    // Clean up interval
    const mainChild = (deps.spawnProcess as ReturnType<typeof vi.fn>).mock.results[0].value;
    queueMicrotask(() => mainChild.emit("exit", 0, null));
    await session.cleanup(config, new AbortController().signal);

    vi.useRealTimers();
  });

  it("silently swallows stats polling errors", async () => {
    vi.useFakeTimers();

    mockGetContainerStats.mockRejectedValue(new Error("container gone"));

    const config = makeMinimalConfig();
    const input = makeInput();
    const deps = makeDeps();
    const turnState = createTurnState();

    const session = await createDockerSession(config, input, deps, turnState);

    // Should not throw even when stats fail
    await vi.advanceTimersByTimeAsync(30_000);

    expect(mockGetContainerStats).toHaveBeenCalled();
    expect(mockGlobalMetrics.containerCpuPercent.set).not.toHaveBeenCalled();

    // Clean up
    const mainChild = (deps.spawnProcess as ReturnType<typeof vi.fn>).mock.results[0].value;
    queueMicrotask(() => mainChild.emit("exit", 0, null));
    await session.cleanup(config, new AbortController().signal);

    vi.useRealTimers();
  });
});
