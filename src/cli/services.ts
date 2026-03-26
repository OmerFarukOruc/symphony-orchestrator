import { AgentRunner } from "../agent-runner/index.js";
import type { SecretBackend } from "@symphony/shared";
import { createGitHubToolProvider, createRepoRouterProvider } from "./runtime-providers.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import { AttemptStoreSqlite } from "../db/attempt-store-sqlite.js";
import { DispatchClient } from "../dispatch/client.js";
import type { RunAttemptDispatcher } from "../dispatch/types.js";
import { FastifyServer } from "../http/fastify-server.js";
import { LinearClient } from "../linear/client.js";
import type { createLogger } from "../core/logger.js";
import { NotificationManager } from "../notification/manager.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { PathRegistry } from "../workspace/path-registry.js";

import { WorkspaceManager } from "../workspace/manager.js";

export async function createServices(
  configStore: ConfigStore,
  overlayStore: ConfigOverlayStore,
  secretsStore: SecretBackend,
  archiveDir: string,
  logger: ReturnType<typeof createLogger>,
) {
  const persistedGithubToken = secretsStore.get("GITHUB_TOKEN");
  if (persistedGithubToken) {
    process.env.GITHUB_TOKEN = persistedGithubToken;
  }
  const attemptStore = new AttemptStoreSqlite(archiveDir, logger.child({ component: "attempt-store", mode: "sqlite" }));
  await attemptStore.start();
  const linearClient = new LinearClient(() => configStore.getConfig(), logger.child({ component: "linear" }));
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
  const notificationManager = new NotificationManager({ logger: logger.child({ component: "notifications" }) });
  const pathRegistry = PathRegistry.fromEnv();
  const repoRouter = createRepoRouterProvider(() => configStore.getConfig());
  const gitManager = createGitHubToolProvider(() => configStore.getConfig(), {
    env: process.env,
    resolveSecret: (name) => secretsStore.get(name) ?? undefined,
  });

  // Dispatch mode: remote (data plane) or local (in-process)
  const dispatchMode = process.env.DISPATCH_MODE ?? "local";
  const agentRunner: RunAttemptDispatcher =
    dispatchMode === "remote"
      ? new DispatchClient({
          dispatchUrl: process.env.DISPATCH_URL ?? "http://data-plane:9100/dispatch", // NOSONAR — internal service-to-service on private network
          secret: process.env.DISPATCH_SHARED_SECRET ?? "",
          getConfig: () => configStore.getConfig(),
          logger: logger.child({ component: "dispatch-client" }),
        })
      : new AgentRunner({
          getConfig: () => configStore.getConfig(),
          linearClient,
          workspaceManager,
          archiveDir,
          pathRegistry,
          githubToolClient: gitManager,
          logger: logger.child({ component: "agent-runner" }),
        });

  const orchestrator = new Orchestrator({
    attemptStore,
    configStore,
    linearClient,
    workspaceManager,
    agentRunner,
    notificationManager,
    repoRouter,
    gitManager,
    logger: logger.child({ component: "orchestrator" }),
  });
  const httpServer = new FastifyServer({
    orchestrator,
    logger: logger.child({ component: "http" }),
    linearClient,
    configStore,
    configOverlayStore: overlayStore,
    secretsStore,

    archiveDir,
  });
  return { orchestrator, httpServer, notificationManager, linearClient };
}
