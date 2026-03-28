import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockLogger } from "../helpers.js";

/* ------------------------------------------------------------------ */
/*  Module-level mocks — intercept every dependency before import      */
/* ------------------------------------------------------------------ */

const mockInitPersistenceRuntime = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    attemptStore: { fake: "attemptStore" },
    db: { fake: "db" },
  }),
);

const mockCreateTracker = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    tracker: { fake: "tracker" },
    linearClient: { fake: "linearClient" },
  }),
);

const mockCreateRepoRouterProvider = vi.hoisted(() => vi.fn().mockReturnValue({ matchIssue: vi.fn() }));

const mockCreateGitHubToolProvider = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    setupWorktree: vi.fn(),
    removeWorktree: vi.fn(),
    deriveBaseCloneDir: vi.fn(),
  }),
);

const mockWorkspaceManager = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { fake: "workspaceManager" };
  }),
);

const mockPathRegistryFromEnv = vi.hoisted(() => vi.fn().mockReturnValue({ fake: "pathRegistry" }));

const mockCreateDispatcher = vi.hoisted(() => vi.fn().mockReturnValue({ fake: "agentRunner" }));

const mockTypedEventBus = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { fake: "eventBus" };
  }),
);

const mockNotificationManager = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { fake: "notificationManager" };
  }),
);

const mockOrchestrator = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { fake: "orchestrator" };
  }),
);

const mockHttpServer = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { fake: "httpServer" };
  }),
);

const mockPromptTemplateStore = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { fake: "templateStore" };
  }),
);

const mockAuditLogger = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { fake: "auditLogger" };
  }),
);

vi.mock("../../src/persistence/sqlite/runtime.js", () => ({
  initPersistenceRuntime: mockInitPersistenceRuntime,
}));

vi.mock("../../src/tracker/factory.js", () => ({
  createTracker: mockCreateTracker,
}));

vi.mock("../../src/cli/runtime-providers.js", () => ({
  createRepoRouterProvider: mockCreateRepoRouterProvider,
  createGitHubToolProvider: mockCreateGitHubToolProvider,
}));

vi.mock("../../src/workspace/manager.js", () => ({
  WorkspaceManager: mockWorkspaceManager,
}));

vi.mock("../../src/workspace/path-registry.js", () => ({
  PathRegistry: { fromEnv: mockPathRegistryFromEnv },
}));

vi.mock("../../src/dispatch/factory.js", () => ({
  createDispatcher: mockCreateDispatcher,
}));

vi.mock("../../src/core/event-bus.js", () => ({
  TypedEventBus: mockTypedEventBus,
}));

vi.mock("../../src/notification/manager.js", () => ({
  NotificationManager: mockNotificationManager,
}));

vi.mock("../../src/orchestrator/orchestrator.js", () => ({
  Orchestrator: mockOrchestrator,
}));

vi.mock("../../src/http/server.js", () => ({
  HttpServer: mockHttpServer,
}));

vi.mock("../../src/prompt/store.js", () => ({
  PromptTemplateStore: mockPromptTemplateStore,
}));

vi.mock("../../src/audit/logger.js", () => ({
  AuditLogger: mockAuditLogger,
}));

/* ------------------------------------------------------------------ */
/*  Import under test (after all mocks registered)                     */
/* ------------------------------------------------------------------ */
import { createServices } from "../../src/cli/services.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeConfigStore() {
  return { getConfig: vi.fn().mockReturnValue({}) };
}

function makeOverlayStore() {
  return { fake: "overlayStore" };
}

function makeSecretsStore() {
  return { get: vi.fn().mockReturnValue(null) };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("createServices", () => {
  const logger = createMockLogger();
  const archiveDir = "/tmp/symphony-test";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with all expected service properties", async () => {
    const result = await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    expect(result).toHaveProperty("orchestrator");
    expect(result).toHaveProperty("httpServer");
    expect(result).toHaveProperty("notificationManager");
    expect(result).toHaveProperty("linearClient");
    expect(result).toHaveProperty("eventBus");
    expect(result).toHaveProperty("persistence");
  });

  it("returns no null or undefined services", async () => {
    const result = await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    expect(result.orchestrator).toBeDefined();
    expect(result.httpServer).toBeDefined();
    expect(result.notificationManager).toBeDefined();
    expect(result.linearClient).toBeDefined();
    expect(result.eventBus).toBeDefined();
    expect(result.persistence).toBeDefined();
  });

  it("initializes persistence with the supplied archiveDir and logger", async () => {
    await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    expect(mockInitPersistenceRuntime).toHaveBeenCalledWith(expect.objectContaining({ dataDir: archiveDir, logger }));
  });

  it("passes workflowPath to persistence when provided", async () => {
    const workflowPath = "/tmp/WORKFLOW.md";

    await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
      workflowPath,
    );

    expect(mockInitPersistenceRuntime).toHaveBeenCalledWith(expect.objectContaining({ workflowPath }));
  });

  it("passes undefined workflowPath to persistence when omitted", async () => {
    await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    expect(mockInitPersistenceRuntime).toHaveBeenCalledWith(expect.objectContaining({ workflowPath: undefined }));
  });

  it("creates tracker using the config getter", async () => {
    const configStore = makeConfigStore();

    await createServices(
      configStore as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    expect(mockCreateTracker).toHaveBeenCalledWith(expect.any(Function), logger);
  });

  it("constructs Orchestrator with wired dependencies", async () => {
    await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    expect(mockOrchestrator).toHaveBeenCalledTimes(1);
    const args = mockOrchestrator.mock.calls[0][0];
    expect(args).toHaveProperty("attemptStore");
    expect(args).toHaveProperty("configStore");
    expect(args).toHaveProperty("tracker");
    expect(args).toHaveProperty("workspaceManager");
    expect(args).toHaveProperty("agentRunner");
    expect(args).toHaveProperty("eventBus");
    expect(args).toHaveProperty("notificationManager");
    expect(args).toHaveProperty("repoRouter");
    expect(args).toHaveProperty("gitManager");
    expect(args).toHaveProperty("logger");
  });

  it("constructs HttpServer with wired dependencies", async () => {
    const configStore = makeConfigStore();
    const overlayStore = makeOverlayStore();
    const secretsStore = makeSecretsStore();

    await createServices(configStore as never, overlayStore as never, secretsStore as never, archiveDir, logger);

    expect(mockHttpServer).toHaveBeenCalledTimes(1);
    const args = mockHttpServer.mock.calls[0][0];
    expect(args).toHaveProperty("orchestrator");
    expect(args).toHaveProperty("logger");
    expect(args).toHaveProperty("tracker");
    expect(args).toHaveProperty("configStore", configStore);
    expect(args).toHaveProperty("configOverlayStore", overlayStore);
    expect(args).toHaveProperty("secretsStore", secretsStore);
    expect(args).toHaveProperty("eventBus");
    expect(args).toHaveProperty("archiveDir", archiveDir);
  });

  it("creates PromptTemplateStore and AuditLogger when persistence.db is present", async () => {
    await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    expect(mockPromptTemplateStore).toHaveBeenCalledTimes(1);
    expect(mockAuditLogger).toHaveBeenCalledTimes(1);
  });

  it("skips PromptTemplateStore and AuditLogger when persistence.db is null", async () => {
    mockInitPersistenceRuntime.mockResolvedValueOnce({
      attemptStore: { fake: "attemptStore" },
      db: null,
    });

    await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    expect(mockPromptTemplateStore).not.toHaveBeenCalled();
    expect(mockAuditLogger).not.toHaveBeenCalled();
  });

  it("passes templateStore and auditLogger to HttpServer when db is present", async () => {
    await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    const httpArgs = mockHttpServer.mock.calls[0][0];
    expect(httpArgs.templateStore).toBeDefined();
    expect(httpArgs.auditLogger).toBeDefined();
  });

  it("passes undefined templateStore and auditLogger to HttpServer when db is null", async () => {
    mockInitPersistenceRuntime.mockResolvedValueOnce({
      attemptStore: { fake: "attemptStore" },
      db: null,
    });

    await createServices(
      makeConfigStore() as never,
      makeOverlayStore() as never,
      makeSecretsStore() as never,
      archiveDir,
      logger,
    );

    const httpArgs = mockHttpServer.mock.calls[0][0];
    expect(httpArgs.templateStore).toBeUndefined();
    expect(httpArgs.auditLogger).toBeUndefined();
  });
});
