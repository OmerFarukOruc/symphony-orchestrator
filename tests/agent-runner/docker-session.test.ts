import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter, Readable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { createMockLogger } from "../helpers.js";
import { createIssue, createWorkspace, createModelSelection } from "../orchestrator/issue-test-factories.js";
import type { ServiceConfig, SymphonyLogger } from "../../src/core/types.js";
import type { DockerSessionDeps } from "../../src/agent-runner/docker-session.js";

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any vi.mock() calls
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const buildDockerRunArgs = vi.fn().mockReturnValue({
    program: "docker",
    args: ["run", "--name", "symphony-MT-42-123"],
    containerName: "symphony-MT-42-123",
    cacheVolumeName: "symphony-cache-MT-42-123",
  });

  const buildInitCacheVolumeArgs = vi.fn().mockReturnValue({
    program: "docker",
    args: ["run", "--rm", "alpine", "chown"],
  });

  const stopContainer = vi.fn().mockResolvedValue(undefined);
  const removeContainer = vi.fn().mockResolvedValue(undefined);
  const removeVolume = vi.fn().mockResolvedValue(undefined);
  const inspectContainerRunning = vi.fn().mockResolvedValue(true);

  const rawSpawn = vi.fn();

  function createMockConnection() {
    return {
      request: vi.fn().mockResolvedValue({}),
      notify: vi.fn(),
      close: vi.fn(),
      interruptTurn: vi.fn().mockResolvedValue(false),
    };
  }

  // Must be a regular function (not arrow) so it can be called with `new`
  const jsonRpcConnectionMock = vi.fn().mockImplementation(function () {
    return createMockConnection();
  });

  return {
    buildDockerRunArgs,
    buildInitCacheVolumeArgs,
    stopContainer,
    removeContainer,
    removeVolume,
    inspectContainerRunning,
    rawSpawn,
    jsonRpcConnectionMock,
    createMockConnection,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/docker/spawn.js", () => ({
  buildDockerRunArgs: mocks.buildDockerRunArgs,
  buildInitCacheVolumeArgs: mocks.buildInitCacheVolumeArgs,
}));

vi.mock("../../src/docker/workspace-mounts.js", () => ({
  resolveWorkspaceExtraMountPaths: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/docker/lifecycle.js", () => ({
  stopContainer: mocks.stopContainer,
  removeContainer: mocks.removeContainer,
  removeVolume: mocks.removeVolume,
  inspectContainerRunning: mocks.inspectContainerRunning,
}));

vi.mock("../../src/docker/stats.js", () => ({
  getContainerStats: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../src/codex/runtime-config.js", () => ({
  prepareCodexRuntimeConfig: vi.fn().mockResolvedValue({
    configToml: "mock-toml",
    authJsonBase64: null,
  }),
  getRequiredProviderEnvNames: vi.fn().mockReturnValue([]),
}));

vi.mock("../../src/agent/json-rpc-connection.js", () => ({
  JsonRpcConnection: mocks.jsonRpcConnectionMock,
}));

vi.mock("../../src/agent/codex-request-handler.js", () => ({
  handleCodexRequest: vi.fn().mockResolvedValue({ response: undefined, fatalFailure: null }),
}));

vi.mock("../../src/agent-runner/notification-handler.js", () => ({
  handleNotification: vi.fn(),
}));

vi.mock("../../src/agent-runner/helpers.js", () => ({
  asRecord: vi.fn().mockImplementation((value: unknown) => (typeof value === "object" && value ? value : {})),
  asString: vi.fn().mockImplementation((value: unknown) => (typeof value === "string" ? value : null)),
}));

vi.mock("../../src/core/lifecycle-events.js", () => ({
  createLifecycleEvent: vi.fn().mockImplementation((input: unknown) => input),
}));

vi.mock("../../src/observability/metrics.js", () => ({
  globalMetrics: {
    containerCpuPercent: { set: vi.fn() },
    containerMemoryPercent: { set: vi.fn() },
  },
}));

vi.mock("../../src/agent-runner/turn-state.js", () => ({
  composeSessionId: vi.fn().mockReturnValue("thread:turn"),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock node:child_process so the direct `spawn` call for the init cache
// volume process (not injected via deps) is also intercepted.
vi.mock("node:child_process", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:child_process")>();
  return {
    ...orig,
    spawn: mocks.rawSpawn,
  };
});

// Import the module under test AFTER all mocks are declared
import { createDockerSession } from "../../src/agent-runner/docker-session.js";

/**
 * vi.clearAllMocks() wipes mockImplementation, so we must re-apply
 * the JsonRpcConnection constructor mock before each test.
 */
function resetMockDefaults() {
  mocks.jsonRpcConnectionMock.mockImplementation(function () {
    return mocks.createMockConnection();
  });
  mocks.buildDockerRunArgs.mockReturnValue({
    program: "docker",
    args: ["run", "--name", "symphony-MT-42-123"],
    containerName: "symphony-MT-42-123",
    cacheVolumeName: "symphony-cache-MT-42-123",
  });
  mocks.buildInitCacheVolumeArgs.mockReturnValue({
    program: "docker",
    args: ["run", "--rm", "alpine", "chown"],
  });
  mocks.stopContainer.mockResolvedValue(undefined);
  mocks.removeContainer.mockResolvedValue(undefined);
  mocks.removeVolume.mockResolvedValue(undefined);
  mocks.inspectContainerRunning.mockResolvedValue(true);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeChild(): ChildProcessWithoutNullStreams {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = Object.assign(new EventEmitter(), {
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn().mockReturnThis(),
  });
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  (child as unknown as Record<string, unknown>).stdout = stdout;
  (child as unknown as Record<string, unknown>).stderr = stderr;
  (child as unknown as Record<string, unknown>).stdin = stdin;
  (child as unknown as Record<string, unknown>).pid = 12345;
  (child as unknown as Record<string, unknown>).kill = vi.fn();
  return child;
}

function makeInitChild(exitCode = 0): ChildProcessWithoutNullStreams {
  const initChild = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  const initStdout = new Readable({ read() {} });
  const initStderr = new Readable({ read() {} });
  (initChild as unknown as Record<string, unknown>).stdout = initStdout;
  (initChild as unknown as Record<string, unknown>).stderr = initStderr;
  (initChild as unknown as Record<string, unknown>).stdin = { write: vi.fn(), on: vi.fn() };
  (initChild as unknown as Record<string, unknown>).stdio = [null, initStdout, initStderr];
  queueMicrotask(() => initChild.emit("exit", exitCode));
  return initChild;
}

/**
 * Configures mocks.rawSpawn to return a successful init child, and
 * returns a fake spawnProcess for the main container.
 */
function setupSpawnMock(mainChild: ChildProcessWithoutNullStreams, initExitCode = 0) {
  mocks.rawSpawn.mockImplementation(() => makeInitChild(initExitCode));
  return vi.fn().mockReturnValue(mainChild);
}

function makeConfig(): ServiceConfig {
  return {
    codex: {
      command: "codex",
      sandbox: { image: "symphony:latest", resources: {} },
      readTimeoutMs: 30_000,
      drainTimeoutMs: 0,
      model: "gpt-5.4",
      reasoningEffort: "high",
    },
  } as unknown as ServiceConfig;
}

function makeInput(overrides?: Partial<{ signal: AbortSignal; onEvent: ReturnType<typeof vi.fn> }>) {
  return {
    issue: createIssue(),
    modelSelection: createModelSelection(),
    workspace: createWorkspace(),
    signal: overrides?.signal ?? new AbortController().signal,
    onEvent: overrides?.onEvent ?? vi.fn(),
  };
}

function makeDeps(overrides?: Partial<DockerSessionDeps>): DockerSessionDeps {
  return {
    logger: createMockLogger(),
    linearClient: null,
    archiveDir: "/tmp/archive",
    ...overrides,
  };
}

function makeTurnState() {
  return {} as import("../../src/agent-runner/turn-state.js").TurnState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createDockerSession", () => {
  let logger: SymphonyLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
    logger = createMockLogger();
  });

  it("returns a session object with all expected DockerSession properties", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ logger, spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    expect(session).toHaveProperty("child");
    expect(session).toHaveProperty("connection");
    expect(session).toHaveProperty("containerName");
    expect(session).toHaveProperty("threadId");
    expect(session).toHaveProperty("turnId");
    expect(session).toHaveProperty("exitPromise");
    expect(session).toHaveProperty("getFatalFailure");
    expect(session).toHaveProperty("inspectRunning");
    expect(session).toHaveProperty("cleanup");
    expect(session).toHaveProperty("steerTurn");
  });

  it("uses the container name from buildDockerRunArgs", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ logger, spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    expect(session.containerName).toBe("symphony-MT-42-123");
  });

  it("initializes threadId and turnId to null", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ logger, spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    expect(session.threadId).toBeNull();
    expect(session.turnId).toBeNull();
  });

  it("emits container_starting lifecycle event", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const onEvent = vi.fn();
    const deps = makeDeps({ logger, spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    await createDockerSession(makeConfig(), makeInput({ onEvent }), deps, makeTurnState());

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "container_starting",
        message: "Starting sandbox container",
      }),
    );
  });

  it("calls buildDockerRunArgs with the correct workspace path and model", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ logger, spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });
    const input = makeInput();

    await createDockerSession(makeConfig(), input, deps, makeTurnState());

    expect(mocks.buildDockerRunArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: input.workspace.path,
        model: input.modelSelection.model,
      }),
    );
  });

  it("spawns the main child with the injected spawnProcess", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ logger, spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    expect(fakeSpawn).toHaveBeenCalledTimes(1);
    expect(fakeSpawn).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["run"]),
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
  });

  it("uses precomputedRuntimeConfig when provided", async () => {
    const { prepareCodexRuntimeConfig } = await import("../../src/codex/runtime-config.js");

    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ logger, spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });
    const precomputed = { configToml: "precomputed-toml", authJsonBase64: "base64data" };

    await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState(), precomputed);

    expect(prepareCodexRuntimeConfig).not.toHaveBeenCalled();
    expect(mocks.buildDockerRunArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeConfigToml: "precomputed-toml",
        runtimeAuthJsonBase64: "base64data",
      }),
    );
  });
});

describe("DockerSession.getFatalFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
  });

  it("returns null when no failure has been recorded", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    expect(session.getFatalFailure()).toBeNull();
  });
});

describe("DockerSession.steerTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
  });

  it("returns false when threadId or turnId is null", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    const result = await session.steerTurn("do something");
    expect(result).toBe(false);
  });

  it("sends turn/steer request when threadId and turnId are set", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    session.threadId = "thread-abc";
    session.turnId = "turn-xyz";

    const result = await session.steerTurn("change direction");

    expect(result).toBe(true);
    expect(session.connection.request).toHaveBeenCalledWith("turn/steer", {
      threadId: "thread-abc",
      turnId: "turn-xyz",
      message: "change direction",
    });
  });

  it("returns false when connection.request throws", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    session.threadId = "thread-abc";
    session.turnId = "turn-xyz";
    vi.mocked(session.connection.request).mockRejectedValueOnce(new Error("connection lost"));

    const result = await session.steerTurn("steer msg");
    expect(result).toBe(false);
  });
});

describe("DockerSession.cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
  });

  it("closes connection, stops container, removes container and volume", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    mainChild.emit("exit", 0, null);

    const cleanupSignal = new AbortController().signal;
    await session.cleanup(makeConfig(), cleanupSignal);

    expect(session.connection.close).toHaveBeenCalled();
    expect(mocks.stopContainer).toHaveBeenCalledWith("symphony-MT-42-123", 5);
    expect(mocks.removeContainer).toHaveBeenCalledWith("symphony-MT-42-123");
    expect(mocks.removeVolume).toHaveBeenCalledWith("symphony-cache-MT-42-123");
  });

  it("removes abort signal listener during cleanup", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const controller = new AbortController();
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(
      makeConfig(),
      makeInput({ signal: controller.signal }),
      deps,
      makeTurnState(),
    );

    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
    mainChild.emit("exit", 0, null);

    await session.cleanup(makeConfig(), controller.signal);

    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});

describe("DockerSession.exitPromise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
  });

  it("resolves with code and signal when child exits", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    mainChild.emit("exit", 137, "SIGKILL");

    const result = await session.exitPromise;
    expect(result).toEqual({ code: 137, signal: "SIGKILL" });
  });
});

describe("abort signal wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
  });

  it("registers abort handler on the input signal", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, "addEventListener");
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    await createDockerSession(makeConfig(), makeInput({ signal: controller.signal }), deps, makeTurnState());

    expect(addSpy).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
  });

  it("calls connection.close and stopContainer on abort", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const controller = new AbortController();
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(
      makeConfig(),
      makeInput({ signal: controller.signal }),
      deps,
      makeTurnState(),
    );

    controller.abort();

    // Allow async IIFE in abort handler to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(session.connection.close).toHaveBeenCalled();
    expect(mocks.stopContainer).toHaveBeenCalledWith("symphony-MT-42-123", 5);
  });
});

describe("cache volume init failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
  });

  it("rejects when cache volume init exits with non-zero code", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild, 1);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    await expect(createDockerSession(makeConfig(), makeInput(), deps, makeTurnState())).rejects.toThrow(
      "Cache volume init failed with exit code 1",
    );
  });
});

describe("session object types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockDefaults();
  });

  it("session methods are all callable functions", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    expect(typeof session.cleanup).toBe("function");
    expect(typeof session.steerTurn).toBe("function");
    expect(typeof session.getFatalFailure).toBe("function");
    expect(typeof session.inspectRunning).toBe("function");
  });

  it("inspectRunning returns true when using injected spawnProcess", async () => {
    const mainChild = makeFakeChild();
    const fakeSpawn = setupSpawnMock(mainChild);
    const deps = makeDeps({ spawnProcess: fakeSpawn as unknown as typeof import("node:child_process").spawn });

    const session = await createDockerSession(makeConfig(), makeInput(), deps, makeTurnState());

    // When spawnProcess !== spawn, inspectRunning returns async () => true
    const running = await session.inspectRunning();
    expect(running).toBe(true);
  });
});
