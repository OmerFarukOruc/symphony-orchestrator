import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { ConfigOverlayStore } from "../config/overlay.js";
import { ConfigStore } from "../config/store.js";
import { HttpServer } from "../http/server.js";
import { createLogger } from "../core/logger.js";
import { getErrorTracker, initErrorTracking } from "../core/error-tracking.js";
import { loadFlags } from "../core/feature-flags.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { SecretsStore } from "../secrets/store.js";
import type { ValidationError } from "../core/types.js";
import { createServices } from "./services.js";
import { wireNotifications, watchConfigChanges } from "./notifications.js";

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
  const { workflowPath, archiveDir, selectedPort, logger } = parseCliArgs(argv);

  const overlayStore = new ConfigOverlayStore(
    path.join(archiveDir, "config", "overlay.yaml"),
    logger.child({ component: "config-overlay" }),
  );
  const fileKey = await readMasterKeyFile(archiveDir);
  const secretsStore = new SecretsStore(
    archiveDir,
    logger.child({ component: "secrets" }),
    fileKey ? { masterKey: fileKey } : undefined,
  );
  await overlayStore.start();
  let needsSetup = false;
  try {
    await secretsStore.start();
  } catch (error) {
    if (error instanceof Error && error.message.includes("MASTER_KEY is required")) {
      logger.warn("MASTER_KEY not configured — starting in setup mode");
      await secretsStore.startDeferred();
      needsSetup = true;
    } else {
      throw error;
    }
  }
  const configStore = new ConfigStore(workflowPath, logger.child({ component: "config" }), {
    overlayStore,
    secretsStore,
  });

  const startError = await safeStartConfigStore(configStore);
  if (startError !== null) return startError;

  const SETUP_MODE_ERRORS = new Set(["missing_tracker_api_key", "missing_tracker_project_slug"]);
  if (!needsSetup) {
    const validationError = configStore.validateDispatch();
    if (validationError) {
      if (SETUP_MODE_ERRORS.has(validationError.code)) {
        logger.warn({ code: validationError.code }, "missing credentials — starting in setup mode");
        needsSetup = true;
      } else {
        printValidationError(validationError);
        await configStore.stop();
        return 1;
      }
    }
  }

  const config = configStore.getConfig();
  const port = selectedPort ?? config.server.port;
  const services = await createServices(configStore, overlayStore, secretsStore, archiveDir, logger);
  wireNotifications(services.notificationManager, configStore, logger);

  const { orchestrator, httpServer } = services;
  await cleanupTransientWorkspaceDirs(config.workspace.root);
  if (!needsSetup) {
    await orchestrator.start();
  }
  await httpServer.start(port);

  const shutdown = buildShutdown(httpServer, orchestrator, configStore, overlayStore, logger);
  logger.info({ workflowPath, port, logDir: archiveDir }, "service started");
  watchConfigChanges(configStore, services.notificationManager, config.server.port, logger);

  await awaitShutdown(logger, shutdown);
  return 0;
}

function parseCliArgs(argv: string[]) {
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
  loadFlags(path.dirname(resolvedWorkflowPath));
  initErrorTracking(logger.child({ component: "error-tracking" }));
  const archiveDir = path.resolve(
    parsed.values["log-dir"] ??
      (process.env.DATA_DIR
        ? path.join(process.env.DATA_DIR, "archives")
        : path.join(path.dirname(resolvedWorkflowPath), ".symphony")),
  );
  const selectedPort = parsed.values.port ? Number(parsed.values.port) : undefined;
  return { workflowPath, resolvedWorkflowPath, archiveDir, selectedPort, logger };
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
  orchestrator: Orchestrator,
  configStore: ConfigStore,
  overlayStore: ConfigOverlayStore,
  logger: ReturnType<typeof createLogger>,
): () => Promise<void> {
  let shuttingDown = false;
  return async () => {
    if (shuttingDown) return;
    shuttingDown = true;
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
