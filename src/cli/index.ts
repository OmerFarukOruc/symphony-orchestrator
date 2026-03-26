import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { ConfigOverlayStore } from "../config/overlay.js";
import { ConfigStore } from "../config/store.js";
import { FEATURE_FLAG_DUAL_SERVER } from "../core/feature-flags.js";
import { HttpServer } from "../http/server.js";
import { createLogger } from "../core/logger.js";
import { getErrorTracker, initErrorTracking } from "../core/error-tracking.js";
import { DualWriteSecretStore } from "../db/secrets-store-sqlite.js";
import { closeSymphonyDatabase } from "../persistence/sqlite/database.js";
import { isEnabled, loadFlags } from "../core/feature-flags.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import type { ValidationError } from "../core/types.js";
import { createServices } from "./services.js";
import { wireNotifications, watchConfigChanges } from "./notifications.js";

interface StoppableServer {
  stop(): Promise<void>;
}

function printValidationError(error: ValidationError): void {
  console.error(`error code=${error.code} msg=${JSON.stringify(error.message)}`);
}

async function cleanupTransientWorkspaceDirs(workspaceRoot: string): Promise<void> {
  await mkdir(workspaceRoot, { recursive: true });
  const entries = await readdir(workspaceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
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

async function initializeSecretsStore(
  archiveDir: string,
  fileKey: string | null,
  logger: ReturnType<typeof createLogger>,
): Promise<{ secretsStore: DualWriteSecretStore; needsSetup: boolean }> {
  const secretsStore = new DualWriteSecretStore(
    archiveDir,
    logger.child({ component: "secrets" }),
    fileKey ? { masterKey: fileKey } : undefined,
  );
  try {
    await secretsStore.start();
    return { secretsStore, needsSetup: false };
  } catch (error) {
    if (error instanceof Error && error.message.includes("MASTER_KEY is required")) {
      logger.warn("MASTER_KEY not configured — starting in setup mode");
      await secretsStore.startDeferred();
      return { secretsStore, needsSetup: true };
    }
    throw error;
  }
}

const SETUP_MODE_ERRORS = new Set(["missing_tracker_api_key", "missing_tracker_project_slug"]);

function checkSetupMode(
  configStore: ConfigStore,
  needsSetup: boolean,
  logger: ReturnType<typeof createLogger>,
): { needsSetup: boolean; exitCode: number | null } {
  if (needsSetup) return { needsSetup: true, exitCode: null };
  const validationError = configStore.validateDispatch();
  if (!validationError) return { needsSetup: false, exitCode: null };
  if (SETUP_MODE_ERRORS.has(validationError.code)) {
    logger.warn({ code: validationError.code }, "missing credentials — starting in setup mode");
    return { needsSetup: true, exitCode: null };
  }
  printValidationError(validationError);
  return { needsSetup: false, exitCode: 1 };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { workflowPath, archiveDir, selectedDbPath, selectedPort, logger } = parseCliArgs(argv);

  if (selectedDbPath) {
    process.env.DB_PATH = selectedDbPath;
  }

  const overlayStore = new ConfigOverlayStore(
    path.join(archiveDir, "config", "overlay.yaml"),
    logger.child({ component: "config-overlay" }),
  );
  const fileKey = await readMasterKeyFile(archiveDir);
  const { secretsStore, needsSetup: secretsNeedSetup } = await initializeSecretsStore(archiveDir, fileKey, logger);
  await overlayStore.start();
  const configStore = new ConfigStore(workflowPath, logger.child({ component: "config" }), {
    overlayStore,
    secretsStore,
  });

  const startError = await safeStartConfigStore(configStore);
  if (startError !== null) return startError;

  const setupCheck = checkSetupMode(configStore, secretsNeedSetup, logger);
  if (setupCheck.exitCode !== null) {
    await configStore.stop();
    return setupCheck.exitCode;
  }
  const needsSetup = setupCheck.needsSetup;

  const config = configStore.getConfig();
  const port = selectedPort ?? config.server.port;
  const services = await createServices(configStore, overlayStore, secretsStore, archiveDir, logger);
  wireNotifications(services.notificationManager, configStore, logger);

  const { orchestrator, httpServer, fastifyServer } = services;
  await cleanupTransientWorkspaceDirs(config.workspace.root);
  if (!needsSetup) {
    await orchestrator.start();
  }
  await httpServer.start(port);
  if (fastifyServer) {
    await fastifyServer.start(4002);
  }

  const shutdown = buildShutdown(
    httpServer,
    fastifyServer,
    orchestrator,
    configStore,
    overlayStore,
    logger,
    archiveDir,
  );
  logger.info(
    {
      workflowPath,
      port,
      fastifyPort: isEnabled(FEATURE_FLAG_DUAL_SERVER) ? 4002 : null,
      logDir: archiveDir,
      dbPath: process.env.DB_PATH ?? null,
    },
    "service started",
  );
  watchConfigChanges(configStore, services.notificationManager, config.server.port, logger);

  await awaitShutdown(logger, shutdown);
  return 0;
}

function parseCliArgs(argv: string[]) {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "db-path": { type: "string" },
      port: { type: "string" },
      "log-dir": { type: "string" },
    },
  });

  const workflowPath = parsed.positionals[0] ?? "./WORKFLOW.md";
  const resolvedWorkflowPath = path.resolve(workflowPath);
  const logger = createLogger();
  loadFlags(path.dirname(resolvedWorkflowPath));
  initErrorTracking(logger.child({ component: "error-tracking" }));
  const archiveDir = path.resolve(
    parsed.values["log-dir"] ??
      (process.env.DATA_DIR
        ? path.join(process.env.DATA_DIR, "archives")
        : path.join(path.dirname(resolvedWorkflowPath), ".symphony")),
  );
  const selectedDbPath = parsed.values["db-path"] ? path.resolve(parsed.values["db-path"]) : process.env.DB_PATH;
  const selectedPort = parsed.values.port ? Number(parsed.values.port) : undefined;
  return { workflowPath, resolvedWorkflowPath, archiveDir, selectedDbPath, selectedPort, logger };
}

async function readMasterKeyFile(archiveDir: string): Promise<string | null> {
  try {
    const content = await readFile(path.join(archiveDir, "master.key"), "utf8");
    return content.trim() || null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function safeStartConfigStore(configStore: ConfigStore): Promise<number | null> {
  try {
    await configStore.start();
    return null;
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
}

function buildShutdown(
  httpServer: HttpServer,
  fastifyServer: StoppableServer | null,
  orchestrator: Orchestrator,
  configStore: ConfigStore,
  overlayStore: ConfigOverlayStore,
  logger: ReturnType<typeof createLogger>,
  archiveDir: string,
): () => Promise<void> {
  let shuttingDown = false;
  return async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (fastifyServer) {
      await fastifyServer.stop().catch((error: unknown) => {
        logger.warn({ error: String(error) }, "fastify server shutdown failed");
      });
    }
    await httpServer.stop().catch((error: unknown) => {
      logger.warn({ error: String(error) }, "http server shutdown failed");
    });
    await orchestrator.stop().catch((error: unknown) => {
      logger.warn({ error: String(error) }, "orchestrator shutdown failed");
    });
    await configStore.stop().catch((error: unknown) => {
      logger.warn({ error: String(error) }, "config store shutdown failed");
    });
    await overlayStore.stop().catch((error: unknown) => {
      logger.warn({ error: String(error) }, "overlay store shutdown failed");
    });
    closeSymphonyDatabase(archiveDir);
    await getErrorTracker()
      .flush()
      .catch((error: unknown) => {
        logger.warn({ error: String(error) }, "error tracker flush failed");
      });
  };
}

async function awaitShutdown(logger: ReturnType<typeof createLogger>, shutdown: () => Promise<void>): Promise<void> {
  await new Promise<void>((resolve) => {
    const handleSignal = (signal: NodeJS.Signals) => {
      logger.info({ signal }, "shutdown signal received");
      void shutdown().finally(resolve);
    };
    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
