import { AuditLogger } from "../audit/logger.js";
import { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoLogger, WebhookConfig } from "../core/types.js";
import { PromptTemplateStore } from "../prompt/store.js";
import { createGitHubToolProvider, createRepoRouterProvider } from "./runtime-providers.js";
import type { ConfigOverlayPort } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import { createDispatcher } from "../dispatch/factory.js";
import { HttpServer } from "../http/server.js";
import type { createLogger } from "../core/logger.js";
import { NotificationManager } from "../notification/manager.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { DefaultWebhookHealthTracker, type WebhookHealthTracker } from "../webhook/health-tracker.js";
import { WebhookRegistrar } from "../webhook/registrar.js";
import { initPersistenceRuntime, type PersistenceRuntime } from "../persistence/sqlite/runtime.js";
import { IssueConfigStore } from "../persistence/sqlite/issue-config-store.js";
import { PathRegistry } from "../workspace/path-registry.js";
import type { SecretsStore } from "../secrets/store.js";
import { createTracker } from "../tracker/factory.js";
import { isRecord } from "../utils/type-guards.js";
import { WorkspaceManager } from "../workspace/manager.js";

/**
 * Evaluate webhook config and emit the appropriate startup log.
 *
 * Returns `true` when webhook mode is fully configured (both URL and
 * secret present), `false` otherwise. Unit 4 will extend this to
 * instantiate the health tracker on the `true` path.
 */
export function evaluateWebhookConfig(
  webhookConfig: WebhookConfig | null | undefined,
  logger: RisolutoLogger,
): boolean {
  if (webhookConfig?.webhookUrl && webhookConfig.webhookSecret) {
    logger.info({ webhookUrl: webhookConfig.webhookUrl }, "webhook mode enabled — waiting for first verified delivery");
    return true;
  }

  if (webhookConfig?.webhookUrl && !webhookConfig.webhookSecret) {
    logger.warn(
      { webhookUrl: webhookConfig.webhookUrl },
      "webhook_url is configured but webhook_secret is missing — set $LINEAR_WEBHOOK_SECRET or configure webhook_secret in Settings",
    );
  }

  return false;
}

export async function createServices(
  configStore: ConfigStore,
  overlayStore: ConfigOverlayPort,
  secretsStore: SecretsStore,
  archiveDir: string,
  logger: ReturnType<typeof createLogger>,
  options?: {
    persistence?: PersistenceRuntime;
  },
) {
  const persistence = options?.persistence ?? (await initPersistenceRuntime({ dataDir: archiveDir, logger }));

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

  const eventBus = new TypedEventBus<RisolutoEventMap>();
  const notificationManager = new NotificationManager({ logger: logger.child({ component: "notifications" }) });

  // --- Webhook integration (manual receive mode) ---
  const webhookEnabled = evaluateWebhookConfig(configStore.getConfig().webhook, logger);
  let webhookHealthTracker: WebhookHealthTracker | undefined;
  if (webhookEnabled) {
    webhookHealthTracker = new DefaultWebhookHealthTracker({
      config: configStore.getConfig().webhook!,
      eventBus,
      logger: logger.child({ component: "webhook-health" }),
      linearClient: linearClient ?? undefined,
    });
  }

  // --- Webhook handler secret (mutable — registrar can update after auto-registration) ---
  let resolvedWebhookSecret: string | null = configStore.getConfig().webhook?.webhookSecret ?? null;

  // --- Webhook registrar (Phase 2: managed registration) ---
  let webhookRegistrar: WebhookRegistrar | undefined;
  if (webhookEnabled && linearClient) {
    webhookRegistrar = new WebhookRegistrar({
      linearClient,
      secretsStore,
      getWebhookConfig: () => configStore.getConfig().webhook,
      onSecretResolved: (secret) => {
        resolvedWebhookSecret = secret;
      },
      logger: logger.child({ component: "webhook-registrar" }),
    });
  }

  const templateStore = persistence.db
    ? new PromptTemplateStore(persistence.db, logger.child({ component: "templates" }))
    : undefined;
  const auditLogger = persistence.db ? new AuditLogger(persistence.db, eventBus) : undefined;
  const issueConfigStore = IssueConfigStore.create(persistence.db);

  const readSelectedTemplateId = (): string | null => {
    const mergedConfigMap = configStore.getMergedConfigMap();
    const systemConfig = mergedConfigMap.system;
    if (!isRecord(systemConfig)) {
      return null;
    }
    const selectedTemplateId = systemConfig.selectedTemplateId;
    return typeof selectedTemplateId === "string" && selectedTemplateId.trim() ? selectedTemplateId : null;
  };

  const resolveTemplate = async (identifier: string): Promise<string> => {
    if (templateStore) {
      const overrideTemplateId = issueConfigStore.getTemplateId(identifier);
      if (overrideTemplateId) {
        const tmpl = templateStore.get(overrideTemplateId);
        if (tmpl) return tmpl.body;
      }
      const selectedTemplateId = readSelectedTemplateId();
      if (selectedTemplateId) {
        const tmpl = templateStore.get(selectedTemplateId);
        if (tmpl) return tmpl.body;
      }
      const def = templateStore.get("default");
      if (def) return def.body;
    }
    logger.warn({ identifier }, "no prompt template found — using empty string");
    return "";
  };

  const orchestrator = new Orchestrator({
    attemptStore: persistence.attemptStore,
    configStore,
    tracker,
    workspaceManager,
    agentRunner,
    issueConfigStore,
    templateStore,
    eventBus,
    notificationManager,
    repoRouter,
    gitManager,
    webhookHealthTracker,
    logger: logger.child({ component: "orchestrator" }),
    resolveTemplate,
  });
  const httpServer = new HttpServer({
    orchestrator,
    logger: logger.child({ component: "http" }),
    tracker,
    configStore,
    configOverlayStore: overlayStore,
    secretsStore,
    eventBus,
    archiveDir,
    templateStore,
    auditLogger,
    webhookHandlerDeps: webhookEnabled
      ? {
          getWebhookSecret: () => resolvedWebhookSecret,
          requestRefresh: (reason: string) => orchestrator.requestRefresh(reason),
          recordVerifiedDelivery: (eventType: string) => webhookHealthTracker?.recordVerifiedDelivery(eventType),
          logger: logger.child({ component: "webhook-handler" }),
        }
      : undefined,
  });

  return {
    orchestrator,
    httpServer,
    notificationManager,
    linearClient,
    eventBus,
    persistence,
    webhookHealthTracker,
    webhookRegistrar,
  };
}
