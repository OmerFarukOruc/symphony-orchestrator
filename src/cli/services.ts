import { AgentRunner } from "../agent-runner/index.js";
import { AttemptStore } from "../core/attempt-store.js";
import { createGitHubToolProvider, createRepoRouterProvider } from "./runtime-providers.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import { HttpServer } from "../http/server.js";
import { LinearClient } from "../linear/client.js";
import type { createLogger } from "../core/logger.js";
import { NotificationManager } from "../notification/manager.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { PathRegistry } from "../workspace/path-registry.js";
import { createLinearPlanningExecutor } from "../planning/executor.js";
import type { SecretsStore } from "../secrets/store.js";
import { WorkspaceManager } from "../workspace/manager.js";

export async function createServices(
  config: ReturnType<ConfigStore["getConfig"]>,
  configStore: ConfigStore,
  overlayStore: ConfigOverlayStore,
  secretsStore: SecretsStore,
  archiveDir: string,
  logger: ReturnType<typeof createLogger>,
) {
  const attemptStore = new AttemptStore(archiveDir, logger.child({ component: "attempt-store" }));
  await attemptStore.start();
  const linearClient = new LinearClient(() => configStore.getConfig(), logger.child({ component: "linear" }));
  const workspaceManager = new WorkspaceManager(
    () => configStore.getConfig(),
    logger.child({ component: "workspace" }),
  );
  const notificationManager = new NotificationManager({ logger: logger.child({ component: "notifications" }) });
  const pathRegistry = PathRegistry.fromEnv();
  const repoRouter = createRepoRouterProvider(() => configStore.getConfig());
  const gitManager = createGitHubToolProvider(() => configStore.getConfig(), { env: process.env });
  const agentRunner = new AgentRunner({
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
  const httpServer = new HttpServer({
    orchestrator,
    logger: logger.child({ component: "http" }),
    configStore,
    configOverlayStore: overlayStore,
    secretsStore,
    executePlan: createLinearPlanningExecutor({ linearClient }),
  });
  return { orchestrator, httpServer, notificationManager, linearClient };
}
