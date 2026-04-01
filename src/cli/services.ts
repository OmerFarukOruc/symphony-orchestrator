import { AuditLogger } from "../audit/logger.js";
import { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoLogger, WebhookConfig } from "../core/types.js";
import { PromptTemplateStore } from "../prompt/store.js";
import { createGitHubToolProvider, createRepoRouterProvider } from "./runtime-providers.js";
import type { ConfigOverlayPort } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import { createDispatcher } from "../dispatch/factory.js";
import type { WebhookHandlerDeps } from "../http/webhook-handler.js";
import { HttpServer } from "../http/server.js";
import type { createLogger } from "../core/logger.js";
import { NotificationManager } from "../notification/manager.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { DefaultWebhookHealthTracker, type WebhookHealthTracker } from "../webhook/health-tracker.js";
import { WebhookRegistrar } from "../webhook/registrar.js";
import { initPersistenceRuntime, type PersistenceRuntime } from "../persistence/sqlite/runtime.js";
import { IssueConfigStore } from "../persistence/sqlite/issue-config-store.js";
import { SqliteWebhookInbox } from "../persistence/sqlite/webhook-inbox.js";
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

/**
 * Build webhook handler deps when webhook URL is configured.
 */
function buildWebhookHandlerDeps(input: {
  orchestrator: Orchestrator;
  webhookHealthTracker: WebhookHealthTracker | undefined;
  webhookInbox: SqliteWebhookInbox | undefined;
  getWebhookSecret: () => string | null;
  getPreviousWebhookSecret: () => string | null;
  logger: ReturnType<typeof createLogger>;
}): WebhookHandlerDeps {
  return {
    getWebhookSecret: input.getWebhookSecret,
    getPreviousWebhookSecret: input.getPreviousWebhookSecret,
    requestRefresh: (reason: string) => input.orchestrator.requestRefresh(reason),
    requestTargetedRefresh: (issueId: string, issueIdentifier: string, reason: string) =>
      input.orchestrator.requestTargetedRefresh(issueId, issueIdentifier, reason),
    stopWorkerForIssue: (issueIdentifier: string, reason: string) =>
      input.orchestrator.stopWorkerForIssue(issueIdentifier, reason),
    recordVerifiedDelivery: (eventType: string) => input.webhookHealthTracker?.recordVerifiedDelivery(eventType),
    webhookInbox: input.webhookInbox,
    logger: input.logger.child({ component: "webhook-handler" }),
  };
}

/**
 * Initialize webhook infrastructure: inbox, health tracker, registrar.
 * Returns a mutable secret reference that the registrar can update.
 */
function initWebhookInfrastructure(input: {
  persistence: PersistenceRuntime;
  webhookConfig: WebhookConfig | null | undefined;
  linearClient: ReturnType<typeof createTracker>["linearClient"];
  eventBus: TypedEventBus<RisolutoEventMap>;
  secretsStore: SecretsStore;
  logger: ReturnType<typeof createLogger>;
}): {
  webhookUrlSet: boolean;
  webhookEnabled: boolean;
  webhookHealthTracker: WebhookHealthTracker | undefined;
  webhookInbox: SqliteWebhookInbox | undefined;
  webhookRegistrar: WebhookRegistrar | undefined;
  resolvedWebhookSecret: { current: string | null };
  resolvedPreviousWebhookSecret: string | null;
} {
  const webhookConfig = input.webhookConfig;
  const webhookUrlSet = !!webhookConfig?.webhookUrl;
  const webhookEnabled = evaluateWebhookConfig(webhookConfig, input.logger);

  const webhookInbox =
    webhookUrlSet && input.persistence.db
      ? new SqliteWebhookInbox(input.persistence.db, input.logger.child({ component: "webhook-inbox" }))
      : undefined;

  const webhookHealthTracker = webhookEnabled
    ? new DefaultWebhookHealthTracker({
        config: webhookConfig!,
        eventBus: input.eventBus,
        logger: input.logger.child({ component: "webhook-health" }),
        linearClient: input.linearClient ?? undefined,
      })
    : undefined;

  const resolvedWebhookSecret = { current: webhookConfig?.webhookSecret ?? null };
  const resolvedPreviousWebhookSecret = webhookConfig?.previousWebhookSecret ?? null;

  const webhookRegistrar =
    webhookUrlSet && input.linearClient
      ? new WebhookRegistrar({
          linearClient: input.linearClient,
          secretsStore: input.secretsStore,
          getWebhookConfig: () => input.webhookConfig,
          onSecretResolved: (secret) => {
            resolvedWebhookSecret.current = secret;
          },
          logger: input.logger.child({ component: "webhook-registrar" }),
        })
      : undefined;

  return {
    webhookUrlSet,
    webhookEnabled,
    webhookHealthTracker,
    webhookInbox,
    webhookRegistrar,
    resolvedWebhookSecret,
    resolvedPreviousWebhookSecret,
  };
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

  // --- Webhook integration ---
  const webhook = initWebhookInfrastructure({
    persistence,
    webhookConfig: configStore.getConfig().webhook,
    linearClient,
    eventBus,
    secretsStore,
    logger,
  });

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
    webhookHealthTracker: webhook.webhookHealthTracker,
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
    webhookHandlerDeps: webhook.webhookUrlSet
      ? buildWebhookHandlerDeps({
          orchestrator,
          webhookHealthTracker: webhook.webhookHealthTracker,
          webhookInbox: webhook.webhookInbox,
          getWebhookSecret: () => webhook.resolvedWebhookSecret.current,
          getPreviousWebhookSecret: () => webhook.resolvedPreviousWebhookSecret,
          logger,
        })
      : undefined,
  });

  return {
    orchestrator,
    httpServer,
    notificationManager,
    linearClient,
    eventBus,
    persistence,
    webhookHealthTracker: webhook.webhookHealthTracker,
    webhookRegistrar: webhook.webhookRegistrar,
    webhookInbox: webhook.webhookInbox,
  };
}
