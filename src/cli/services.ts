import path from "node:path";

import { AttemptStore } from "../core/attempt-store.js";
import { TypedEventBus } from "../core/event-bus.js";
import type { SymphonyEventMap } from "../core/symphony-events.js";
import { createGitHubToolProvider, createRepoRouterProvider } from "./runtime-providers.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import { createDispatcher } from "../dispatch/factory.js";
import { HttpServer } from "../http/server.js";
import type { createLogger } from "../core/logger.js";
import type { AttemptStorePort } from "../core/attempt-store-port.js";
import type { SymphonyLogger } from "../core/types.js";
import { NotificationManager } from "../notification/manager.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { SqliteAttemptStore } from "../persistence/sqlite/attempt-store-sqlite.js";
import { PathRegistry } from "../workspace/path-registry.js";
import type { SecretsStore } from "../secrets/store.js";
import { createTracker } from "../tracker/factory.js";
import { WorkspaceManager } from "../workspace/manager.js";

export async function createServices(
  configStore: ConfigStore,
  overlayStore: ConfigOverlayStore,
  secretsStore: SecretsStore,
  archiveDir: string,
  logger: ReturnType<typeof createLogger>,
) {
  const persistedGithubToken = secretsStore.get("GITHUB_TOKEN");
  if (persistedGithubToken) {
    process.env.GITHUB_TOKEN = persistedGithubToken;
  }

  const persistenceMode = process.env.SYMPHONY_PERSISTENCE ?? "sqlite";
  const storeLogger = logger.child({ component: "attempt-store" });
  const attemptStore = await createAttemptStore(persistenceMode, archiveDir, storeLogger);

  const { tracker, linearClient } = createTracker(() => configStore.getConfig(), logger);

  const repoRouter = createRepoRouterProvider(() => configStore.getConfig());
  const gitManager = createGitHubToolProvider(() => configStore.getConfig(), {
    env: process.env,
    resolveSecret: (name) => secretsStore.get(name) ?? undefined,
  });

  const workspaceManager = new WorkspaceManager(
    () => configStore.getConfig(),
    logger.child({ component: "workspace" }),
    {
      gitManager: {
        setupWorktree: (route, baseCloneDir, worktreePath, issue, branchPrefix) =>
          gitManager.setupWorktree(route, baseCloneDir, worktreePath, issue, branchPrefix),
        removeWorktree: (baseCloneDir, worktreePath, force) =>
          gitManager.removeWorktree(baseCloneDir, worktreePath, force),
        deriveBaseCloneDir: (workspaceRoot, repoUrl) => gitManager.deriveBaseCloneDir(workspaceRoot, repoUrl),
      },
      repoRouter: {
        matchIssue: (issue) => repoRouter.matchIssue(issue),
      },
    },
  );

  const pathRegistry = PathRegistry.fromEnv();
  const agentRunner = createDispatcher(() => configStore.getConfig(), {
    tracker,
    linearClient,
    workspaceManager,
    archiveDir,
    pathRegistry,
    githubToolClient: gitManager,
    logger,
  });

  const eventBus = new TypedEventBus<SymphonyEventMap>();
  const notificationManager = new NotificationManager({ logger: logger.child({ component: "notifications" }) });

  const orchestrator = new Orchestrator({
    attemptStore,
    configStore,
    tracker,
    workspaceManager,
    agentRunner,
    eventBus,
    notificationManager,
    repoRouter,
    gitManager,
    logger: logger.child({ component: "orchestrator" }),
  });

  const httpServer = new HttpServer({
    orchestrator,
    logger: logger.child({ component: "http" }),
    tracker,
    configStore,
    configOverlayStore: overlayStore,
    secretsStore,
    archiveDir,
  });

  return { orchestrator, httpServer, notificationManager, linearClient };
}

async function createAttemptStore(mode: string, archiveDir: string, logger: SymphonyLogger): Promise<AttemptStorePort> {
  if (mode === "jsonl") {
    const store = new AttemptStore(archiveDir, logger);
    await store.start();
    return store;
  }
  const store = new SqliteAttemptStore(path.join(archiveDir, "symphony.db"), logger);
  await store.start();
  await store.migrateFromArchive(archiveDir);
  return store;
}
