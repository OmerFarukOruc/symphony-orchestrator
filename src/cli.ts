import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { AgentRunner } from "./agent-runner.js";
import { AttemptStore } from "./attempt-store.js";
import { ConfigOverlayStore } from "./config-overlay.js";
import { ConfigStore } from "./config.js";
import { GitManager } from "./git-manager.js";
import { HttpServer } from "./http-server.js";
import { LinearClient } from "./linear-client.js";
import { createLogger } from "./logger.js";
import { NotificationManager } from "./notification-manager.js";
import { Orchestrator } from "./orchestrator.js";
import { PathRegistry } from "./path-registry.js";
import { RepoRouter } from "./repo-router.js";
import { SecretsStore } from "./secrets-store.js";
import { SlackWebhookChannel } from "./slack-webhook.js";
import type { ValidationError } from "./types.js";
import { WorkspaceManager } from "./workspace-manager.js";

function printValidationError(error: ValidationError): void {
  console.error(`error code=${error.code} msg=${JSON.stringify(error.message)}`);
}

async function cleanupTransientWorkspaceDirs(workspaceRoot: string): Promise<void> {
  await mkdir(workspaceRoot, { recursive: true });
  const entries = await readdir(workspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    for (const transientName of ["tmp", ".elixir_ls"]) {
      await rm(path.join(workspaceRoot, entry.name, transientName), {
        recursive: true,
        force: true,
      });
    }
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      port: { type: "string" },
      "log-dir": { type: "string" },
    },
  });

  const workflowPath = parsed.positionals[0] ?? "./WORKFLOW.md";
  const resolvedWorkflowPath = path.resolve(workflowPath);
  const logger = createLogger();
  const archiveDir = path.resolve(
    parsed.values["log-dir"] ??
      (process.env.DATA_DIR
        ? path.join(process.env.DATA_DIR, "archives")
        : path.join(path.dirname(resolvedWorkflowPath), ".symphony")),
  );
  const overlayStore = new ConfigOverlayStore(
    path.join(archiveDir, "config", "overlay.yaml"),
    logger.child({ component: "config-overlay" }),
  );
  const secretsStore = new SecretsStore(archiveDir, logger.child({ component: "secrets" }));
  await overlayStore.start();
  await secretsStore.start();
  const configStore = new ConfigStore(workflowPath, logger.child({ component: "config" }), {
    overlayStore,
    secretsStore,
  });

  try {
    await configStore.start();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "validationError" in error &&
      typeof (error as { validationError?: unknown }).validationError === "object"
    ) {
      printValidationError((error as { validationError: ValidationError }).validationError);
      return 1;
    }
    throw error;
  }

  const validationError = configStore.validateDispatch();
  if (validationError) {
    printValidationError(validationError);
    await configStore.stop();
    return 1;
  }

  const config = configStore.getConfig();
  const selectedPort = parsed.values.port ? Number(parsed.values.port) : config.server.port;
  const attemptStore = new AttemptStore(archiveDir, logger.child({ component: "attempt-store" }));
  await attemptStore.start();
  const linearClient = new LinearClient(() => configStore.getConfig(), logger.child({ component: "linear" }));
  const workspaceManager = new WorkspaceManager(
    () => configStore.getConfig(),
    logger.child({ component: "workspace" }),
  );
  const notificationManager = new NotificationManager({
    logger: logger.child({ component: "notifications" }),
  });
  const configureNotifications = () => {
    for (const channelName of notificationManager.listChannels()) {
      notificationManager.removeChannel(channelName);
    }
    const slack = configStore.getConfig().notifications?.slack;
    if (slack?.webhookUrl) {
      notificationManager.registerChannel(
        new SlackWebhookChannel({
          webhookUrl: slack.webhookUrl,
          verbosity: slack.verbosity,
          logger: logger.child({ component: "slack-webhook" }),
        }),
      );
    }
  };
  configureNotifications();

  const pathRegistry = PathRegistry.fromEnv();
  const repoRouter = {
    matchIssue: (issue: Parameters<RepoRouter["matchIssue"]>[0]) =>
      new RepoRouter(
        (configStore.getConfig().repos ?? []).map((route) => ({
          repoUrl: route.repoUrl,
          defaultBranch: route.defaultBranch,
          identifierPrefix: route.identifierPrefix ?? undefined,
          label: route.label ?? undefined,
          githubOwner: route.githubOwner ?? undefined,
          githubRepo: route.githubRepo ?? undefined,
          githubTokenEnv: route.githubTokenEnv ?? undefined,
        })),
      ).matchIssue(issue),
  };
  const gitManager = {
    cloneInto: (...args: Parameters<GitManager["cloneInto"]>) =>
      new GitManager({
        env: process.env,
        apiBaseUrl: configStore.getConfig().github?.apiBaseUrl ?? "https://api.github.com",
      }).cloneInto(...args),
    commitAndPush: (...args: Parameters<GitManager["commitAndPush"]>) =>
      new GitManager({
        env: process.env,
        apiBaseUrl: configStore.getConfig().github?.apiBaseUrl ?? "https://api.github.com",
      }).commitAndPush(...args),
    createPullRequest: (...args: Parameters<GitManager["createPullRequest"]>) =>
      new GitManager({
        env: process.env,
        apiBaseUrl: configStore.getConfig().github?.apiBaseUrl ?? "https://api.github.com",
      }).createPullRequest(...args),
    addPrComment: (...args: Parameters<GitManager["addPrComment"]>) =>
      new GitManager({
        env: process.env,
        apiBaseUrl: configStore.getConfig().github?.apiBaseUrl ?? "https://api.github.com",
      }).addPrComment(...args),
    getPrStatus: (...args: Parameters<GitManager["getPrStatus"]>) =>
      new GitManager({
        env: process.env,
        apiBaseUrl: configStore.getConfig().github?.apiBaseUrl ?? "https://api.github.com",
      }).getPrStatus(...args),
  };
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
  });

  await cleanupTransientWorkspaceDirs(config.workspace.root);
  await orchestrator.start();
  await httpServer.start(selectedPort);

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await httpServer.stop().catch(() => undefined);
    await orchestrator.stop().catch(() => undefined);
    await configStore.stop().catch(() => undefined);
    await overlayStore.stop().catch(() => undefined);
  };

  logger.info(
    {
      workflowPath,
      port: selectedPort,
      logDir: archiveDir,
    },
    "service started",
  );

  const initialPort = config.server.port;
  const unsubscribe = configStore.subscribe(() => {
    configureNotifications();
    const latestConfig = configStore.getConfig();
    if (latestConfig.server.port !== initialPort) {
      logger.warn(
        {
          previousPort: initialPort,
          nextPort: latestConfig.server.port,
        },
        "server.port changed in workflow; restart required to apply",
      );
    }
  });

  await new Promise<void>((resolve) => {
    const handleSignal = (signal: NodeJS.Signals) => {
      logger.info({ signal }, "shutdown signal received");
      void shutdown().finally(resolve);
    };
    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
  });
  unsubscribe();
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
