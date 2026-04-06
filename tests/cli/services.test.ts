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
    trackerToolProvider: { toolNames: [], handleToolCall: vi.fn() },
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

const mockPromptTemplateStore = vi.hoisted(() => vi.fn());

const mockAuditLogger = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { fake: "auditLogger" };
  }),
);

const mockIssueConfigStoreCreate = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    getTemplateId: vi.fn().mockReturnValue(null),
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

vi.mock("../../src/persistence/sqlite/issue-config-store.js", () => ({
  IssueConfigStore: {
    create: mockIssueConfigStoreCreate,
  },
}));

/* ------------------------------------------------------------------ */
/*  Import under test (after all mocks registered)                     */
/* ------------------------------------------------------------------ */
import { createServices } from "../../src/cli/services.js";
import type { ConfigStore } from "../../src/config/store.js";
import type { ConfigOverlayPort } from "../../src/config/overlay.js";
import type { SecretsStore } from "../../src/secrets/store.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeConfigStore() {
  return {
    getConfig: vi.fn().mockReturnValue({}),
    getMergedConfigMap: vi.fn().mockReturnValue({}),
  };
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
  const archiveDir = "/tmp/risoluto-test";

  beforeEach(() => {
    vi.clearAllMocks();
    mockPromptTemplateStore.mockImplementation(function () {
      return {
        get: vi.fn().mockImplementation((id: string) => {
          if (id === "default") {
            return { id, body: "default template body" };
          }
          return null;
        }),
      };
    });
    mockIssueConfigStoreCreate.mockReturnValue({
      getTemplateId: vi.fn().mockReturnValue(null),
    });
  });

  it("returns an object with all expected service properties", async () => {
    const result = await createServices(
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
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
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
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

  it("initializes persistence with the supplied archiveDir and logger", async () => {
    await createServices(
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    expect(mockInitPersistenceRuntime).toHaveBeenCalledWith(expect.objectContaining({ dataDir: archiveDir, logger }));
  });

  it("does not pass workflowPath to persistence", async () => {
    await createServices(
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    expect(mockInitPersistenceRuntime).toHaveBeenCalledWith(
      expect.not.objectContaining({ workflowPath: expect.anything() }),
    );
  });

  it("creates tracker using the config getter", async () => {
    const configStore = makeConfigStore();

    await createServices(
      configStore as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    expect(mockCreateTracker).toHaveBeenCalledWith(expect.any(Function), logger);
  });

  it("passes the persistence attemptStore into HttpServer", async () => {
    await createServices(
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    expect(mockHttpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptStore: { fake: "attemptStore" },
      }),
    );
  });

  it("constructs Orchestrator with wired dependencies", async () => {
    await createServices(
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
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

    await createServices(
      configStore as unknown as ConfigStore,
      overlayStore as unknown as ConfigOverlayPort,
      secretsStore as unknown as SecretsStore,
      archiveDir,
      logger,
    );

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
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
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
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    expect(mockPromptTemplateStore).not.toHaveBeenCalled();
    expect(mockAuditLogger).not.toHaveBeenCalled();
  });

  it("passes templateStore and auditLogger to HttpServer when db is present", async () => {
    await createServices(
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    const httpArgs = mockHttpServer.mock.calls[0][0];
    expect(httpArgs).toHaveProperty("templateStore");
    expect(httpArgs).toHaveProperty("auditLogger");
  });

  it("passes undefined templateStore and auditLogger to HttpServer when db is null", async () => {
    mockInitPersistenceRuntime.mockResolvedValueOnce({
      attemptStore: { fake: "attemptStore" },
      db: null,
    });

    await createServices(
      makeConfigStore() as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    const httpArgs = mockHttpServer.mock.calls[0][0];
    expect(httpArgs.templateStore).toBeUndefined();
    expect(httpArgs.auditLogger).toBeUndefined();
  });

  it("resolves templates using system.selectedTemplateId before default fallback", async () => {
    const configStore = makeConfigStore();
    configStore.getMergedConfigMap.mockReturnValue({
      system: {
        selectedTemplateId: "active-template",
      },
    });
    const templateGet = vi.fn().mockImplementation((id: string) => {
      if (id === "active-template") {
        return { id, body: "active template body" };
      }
      if (id === "default") {
        return { id, body: "default template body" };
      }
      return null;
    });
    mockPromptTemplateStore.mockImplementation(function () {
      return {
        get: templateGet,
      };
    });

    await createServices(
      configStore as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    const orchestratorArgs = mockOrchestrator.mock.calls[0][0];
    await expect(orchestratorArgs.resolveTemplate("MT-1")).resolves.toBe("active template body");
    expect(templateGet).toHaveBeenCalledWith("active-template");
  });

  it("prefers per-issue template overrides over system.selectedTemplateId", async () => {
    const configStore = makeConfigStore();
    configStore.getMergedConfigMap.mockReturnValue({
      system: {
        selectedTemplateId: "active-template",
      },
    });
    mockIssueConfigStoreCreate.mockReturnValue({
      getTemplateId: vi.fn().mockReturnValue("issue-template"),
    });
    const templateGet = vi.fn().mockImplementation((id: string) => {
      if (id === "issue-template") {
        return { id, body: "issue template body" };
      }
      if (id === "active-template") {
        return { id, body: "active template body" };
      }
      if (id === "default") {
        return { id, body: "default template body" };
      }
      return null;
    });
    mockPromptTemplateStore.mockImplementation(function () {
      return {
        get: templateGet,
      };
    });

    await createServices(
      configStore as unknown as ConfigStore,
      makeOverlayStore() as unknown as ConfigOverlayPort,
      makeSecretsStore() as unknown as SecretsStore,
      archiveDir,
      logger,
    );

    const orchestratorArgs = mockOrchestrator.mock.calls[0][0];
    await expect(orchestratorArgs.resolveTemplate("MT-1")).resolves.toBe("issue template body");
    expect(templateGet).toHaveBeenCalledWith("issue-template");
  });
});
