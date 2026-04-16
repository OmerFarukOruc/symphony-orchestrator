import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { ConfigOverlayStore } from "../config/overlay.js";
import { ConfigStore } from "../config/store.js";
import { DbConfigStore } from "../config/db-store.js";
import type { TypedEventBus } from "../core/event-bus.js";
import { HttpServer } from "../http/server.js";
import type { RisolutoLogger } from "../core/types.js";
import { getErrorTracker } from "../core/error-tracking.js";
import { parseCliArgs } from "./parse-args.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { PersistenceRuntime } from "../persistence/sqlite/runtime.js";
import { initPersistenceRuntime } from "../persistence/sqlite/runtime.js";
import { SecretsStore } from "../secrets/store.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { ValidationError } from "../core/types.js";
import type { WebhookHealthTracker } from "../webhook/health-tracker.js";
import type { WebhookRegistrar } from "../webhook/registrar.js";
import { toErrorString } from "../utils/type-guards.js";
import { createServices } from "./services.js";
import { wireNotifications, watchConfigChanges } from "./notifications.js";
import type { PrMonitorService } from "../git/pr-monitor.js";
import type { AutomationScheduler } from "../automation/scheduler.js";
import type { AlertEngine } from "../alerts/engine.js";

const SETUP_MODE_ERRORS = new Set(["missing_tracker_api_key", "missing_tracker_project_slug"]);

function printValidationError(error: ValidationError): void {
  console.error(`error code=${error.code} msg=${JSON.stringify(error.message)}`);
}

export async function cleanupTransientWorkspaceDirs(workspaceRoot: string): Promise<void> {
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

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { dataDir, archiveDir, selectedPort, logger } = parseCliArgs(argv);

  const {
    overlayStore,
    secretsStore,
    configStore,
    persistence,
    needsSetup: initialNeedsSetup,
  } = await initializeConfigStores(archiveDir, logger);
  let needsSetup = initialNeedsSetup;

  const startError = await safeStartConfigStore(configStore);
  if (startError !== null) {
    await overlayStore.stop();
    persistence.close();
    return startError;
  }

  const validationResult = evaluateSetupMode(configStore, logger, needsSetup);
  if (validationResult.exitCode !== null) {
    await configStore.stop();
    await overlayStore.stop();
    persistence.close();
    return validationResult.exitCode;
  }
  needsSetup = validationResult.needsSetup;

  const config = configStore.getConfig();
  const port = selectedPort ?? config.server.port;
  const services = await createServices(configStore, overlayStore, secretsStore, archiveDir, logger, { persistence });
  wireNotifications(services.notificationManager, configStore, logger);

  const { orchestrator, httpServer, eventBus, prMonitor } = services;
  await cleanupTransientWorkspaceDirs(config.workspace.root);
  if (!needsSetup) {
    await orchestrator.start();
    prMonitor.start();
    services.automationScheduler.start();
    services.alertEngine.start();
  }
  await httpServer.start(port);

  // Register webhook AFTER HTTP listener is live (startup invariant: no delivery failures during gap)
  await services.webhookRegistrar?.register();

  const shutdown = buildShutdown({
    httpServer,
    orchestrator,
    configStore,
    overlayStore,
    eventBus,
    persistence: services.persistence,
    webhookHealthTracker: services.webhookHealthTracker,
    webhookRegistrar: services.webhookRegistrar,
    prMonitor,
    automationScheduler: services.automationScheduler,
    alertEngine: services.alertEngine,
    logger,
  });
  logger.info({ dataDir, port, archiveDir }, "service started");
  watchConfigChanges(configStore, services.notificationManager, config.server.port, logger);

  await awaitShutdown(logger, shutdown);
  return 0;
}

async function initializeConfigStores(
  archiveDir: string,
  logger: RisolutoLogger,
): Promise<{
  overlayStore: ConfigOverlayStore;
  secretsStore: SecretsStore;
  configStore: ConfigStore;
  persistence: PersistenceRuntime;
  needsSetup: boolean;
}> {
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
      await overlayStore.stop();
      throw error;
    }
  }
  if (process.env.RISOLUTO_PERSISTENCE === "jsonl") {
    logger.warn(
      "RISOLUTO_PERSISTENCE=jsonl is no longer supported. SQLite is now the only backend. This env var will be removed in a future release.",
    );
  }
  let persistence: PersistenceRuntime;
  try {
    persistence = await initPersistenceRuntime({ dataDir: archiveDir, logger });
  } catch (error) {
    await overlayStore.stop();
    throw error;
  }
  const dbLogger = logger.child({ component: "config-db" });
  const dbConfigStore = new DbConfigStore(persistence.db, dbLogger, { secretsStore });
  const configStore = new ConfigStore(logger.child({ component: "config" }), {
    overlayStore,
    secretsStore,
    workflowStore: {
      getWorkflow: () => {
        try {
          dbConfigStore.refresh();
        } catch (error) {
          dbLogger.warn({ error: toErrorString(error) }, "DB config refresh failed — propagating to caller");
          throw error;
        }
        return dbConfigStore.getWorkflow();
      },
    },
  });
  return { overlayStore, secretsStore, configStore, persistence, needsSetup };
}

export { parseCliArgs };

export async function readMasterKeyFile(archiveDir: string): Promise<string | null> {
  try {
    const content = await readFile(path.join(archiveDir, "master.key"), "utf8");
    return content.trim() || null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function safeStartConfigStore(configStore: ConfigStore): Promise<number | null> {
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

export function evaluateSetupMode(
  configStore: ConfigStore,
  logger: RisolutoLogger,
  needsSetup: boolean,
): { needsSetup: boolean; exitCode: number | null } {
  if (needsSetup) {
    return { needsSetup, exitCode: null };
  }

  const validationError = configStore.validateDispatch();
  if (!validationError) {
    return { needsSetup: false, exitCode: null };
  }
  if (SETUP_MODE_ERRORS.has(validationError.code)) {
    logger.warn({ code: validationError.code }, "missing credentials — starting in setup mode");
    return { needsSetup: true, exitCode: null };
  }

  printValidationError(validationError);
  return { needsSetup: false, exitCode: 1 };
}

function buildShutdown({
  httpServer,
  orchestrator,
  configStore,
  overlayStore,
  eventBus,
  persistence,
  webhookHealthTracker,
  webhookRegistrar,
  prMonitor,
  automationScheduler,
  alertEngine,
  logger,
}: {
  httpServer: HttpServer;
  orchestrator: OrchestratorPort;
  configStore: ConfigStore;
  overlayStore: ConfigOverlayStore;
  eventBus: TypedEventBus<RisolutoEventMap>;
  persistence: PersistenceRuntime;
  webhookHealthTracker?: WebhookHealthTracker;
  webhookRegistrar?: WebhookRegistrar;
  prMonitor?: PrMonitorService;
  automationScheduler?: AutomationScheduler;
  alertEngine?: AlertEngine;
  logger: RisolutoLogger;
}): () => Promise<void> {
  let shuttingDown = false;
  return async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    prMonitor?.stop();
    automationScheduler?.stop();
    alertEngine?.stop();
    await httpServer.stop().catch((error: unknown) => {
      logger.warn({ error: toErrorString(error) }, "http server shutdown failed");
    });
    await orchestrator.stop().catch((error: unknown) => {
      logger.warn({ error: toErrorString(error) }, "orchestrator shutdown failed");
    });
    webhookRegistrar?.stop();
    webhookHealthTracker?.stop();
    await configStore.stop().catch((error: unknown) => {
      logger.warn({ error: toErrorString(error) }, "config store shutdown failed");
    });
    await overlayStore.stop().catch((error: unknown) => {
      logger.warn({ error: toErrorString(error) }, "overlay store shutdown failed");
    });
    await getErrorTracker()
      .flush()
      .catch((error: unknown) => {
        logger.warn({ error: toErrorString(error) }, "error tracker flush failed");
      });
    eventBus.destroy();
    try {
      persistence.close();
    } catch (error) {
      logger.warn({ error: toErrorString(error) }, "persistence runtime close failed");
    }
  };
}

async function awaitShutdown(logger: RisolutoLogger, shutdown: () => Promise<void>): Promise<void> {
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
