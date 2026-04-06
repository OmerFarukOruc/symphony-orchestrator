import { AuditLogger } from "../audit/logger.js";
import { AlertEngine } from "../alerts/engine.js";
import { AlertHistoryStore, type AlertHistoryStorePort } from "../alerts/history-store.js";
import { AutomationRunner } from "../automation/runner.js";
import { AutomationScheduler } from "../automation/scheduler.js";
import { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { WebhookConfig } from "../core/types.js";
import { PromptTemplateStore } from "../prompt/store.js";
import { createTemplateResolver } from "../prompt/resolver.js";
import { createGitHubToolProvider, createRepoRouterProvider } from "./runtime-providers.js";
import type { ConfigOverlayPort } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import { createDispatcher } from "../dispatch/factory.js";
import { HttpServer } from "../http/server.js";
import type { createLogger } from "../core/logger.js";
import { NotificationManager } from "../notification/manager.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { initPersistenceRuntime, type PersistenceRuntime } from "../persistence/sqlite/runtime.js";
import { IssueConfigStore } from "../persistence/sqlite/issue-config-store.js";
import { AutomationStore, type AutomationStorePort } from "../persistence/sqlite/automation-store.js";
import { NotificationStore, type NotificationStorePort } from "../persistence/sqlite/notification-store.js";
import { PathRegistry } from "../workspace/path-registry.js";
import type { SecretsStore } from "../secrets/store.js";
import { createTracker } from "../tracker/factory.js";
import { WorkspaceManager } from "../workspace/manager.js";
import { PrMonitorService, type PrMonitorGhClient } from "../git/pr-monitor.js";
import { initWebhookInfrastructure, buildWebhookHandlerDeps } from "../webhook/composition.js";

// Re-export for consumers that import evaluateWebhookConfig from this module
// (e.g. tests/webhook/manual-mode.test.ts).
export { evaluateWebhookConfig } from "../webhook/composition.js";
export type { WebhookConfig };

// ---------------------------------------------------------------------------
// Phase types
// ---------------------------------------------------------------------------

interface InfrastructurePhase {
  persistence: PersistenceRuntime;
  tracker: ReturnType<typeof createTracker>["tracker"];
  linearClient: ReturnType<typeof createTracker>["linearClient"];
  repoRouter: ReturnType<typeof createRepoRouterProvider>;
  gitManager: ReturnType<typeof createGitHubToolProvider>;
}

interface WorkspaceDispatchPhase {
  workspaceManager: WorkspaceManager;
  pathRegistry: PathRegistry;
  agentRunner: ReturnType<typeof createDispatcher>;
}

interface EventNotificationPhase {
  eventBus: TypedEventBus<RisolutoEventMap>;
  notificationStore: NotificationStorePort;
  automationStore: AutomationStorePort;
  alertHistoryStore: AlertHistoryStorePort;
  notificationManager: NotificationManager;
}

interface TemplateAuditPhase {
  templateStore: PromptTemplateStore | undefined;
  auditLogger: AuditLogger | undefined;
  issueConfigStore: IssueConfigStore;
  resolveTemplate: (identifier: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Phase 1 — Infrastructure: persistence, tracker, git providers
// ---------------------------------------------------------------------------

async function createInfrastructure(
  configStore: ConfigStore,
  secretsStore: SecretsStore,
  archiveDir: string,
  logger: ReturnType<typeof createLogger>,
  options?: { persistence?: PersistenceRuntime },
): Promise<InfrastructurePhase> {
  const persistence = options?.persistence ?? (await initPersistenceRuntime({ dataDir: archiveDir, logger }));
  const { tracker, linearClient } = createTracker(() => configStore.getConfig(), logger);
  const repoRouter = createRepoRouterProvider(() => configStore.getConfig());
  const gitManager = createGitHubToolProvider(() => configStore.getConfig(), {
    env: process.env,
    resolveSecret: (name) => secretsStore.get(name) ?? undefined,
  });

  return { persistence, tracker, linearClient, repoRouter, gitManager };
}

// ---------------------------------------------------------------------------
// Phase 2 — Workspace + Dispatch
// ---------------------------------------------------------------------------

function createWorkspaceAndDispatch(
  configStore: ConfigStore,
  infra: InfrastructurePhase,
  archiveDir: string,
  logger: ReturnType<typeof createLogger>,
): WorkspaceDispatchPhase {
  const { tracker, linearClient, gitManager, repoRouter } = infra;

  const workspaceManager = new WorkspaceManager(
    () => configStore.getConfig(),
    logger.child({ component: "workspace" }),
    {
      gitManager: {
        hasUncommittedChanges: (workspaceDir) => gitManager.hasUncommittedChanges(workspaceDir),
        autoCommit: (workspaceDir, message, options) => gitManager.autoCommit(workspaceDir, message, options),
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

  return { workspaceManager, pathRegistry, agentRunner };
}

// ---------------------------------------------------------------------------
// Phase 3 — Event + Notification
// ---------------------------------------------------------------------------

function createEventAndNotification(
  persistence: PersistenceRuntime,
  logger: ReturnType<typeof createLogger>,
): EventNotificationPhase {
  const eventBus = new TypedEventBus<RisolutoEventMap>();
  const notificationStore = NotificationStore.create(persistence.db);
  const automationStore = AutomationStore.create(persistence.db);
  const alertHistoryStore = AlertHistoryStore.create(persistence.db);
  const notificationManager = new NotificationManager({
    logger: logger.child({ component: "notifications" }),
    eventBus,
    store: notificationStore,
  });

  return { eventBus, notificationStore, automationStore, alertHistoryStore, notificationManager };
}

// ---------------------------------------------------------------------------
// Phase 5 — Template + Audit
// ---------------------------------------------------------------------------

function createTemplateAndAudit(
  configStore: ConfigStore,
  persistence: PersistenceRuntime,
  eventBus: TypedEventBus<RisolutoEventMap>,
  logger: ReturnType<typeof createLogger>,
): TemplateAuditPhase {
  const templateStore = persistence.db
    ? new PromptTemplateStore(persistence.db, logger.child({ component: "templates" }))
    : undefined;
  const auditLogger = persistence.db ? new AuditLogger(persistence.db, eventBus) : undefined;
  const issueConfigStore = IssueConfigStore.create(persistence.db);

  const resolveTemplate = createTemplateResolver({
    templateStore,
    issueConfigStore,
    configStore,
    logger,
  });

  return { templateStore, auditLogger, issueConfigStore, resolveTemplate };
}

// ---------------------------------------------------------------------------
// Phase 6 — Runtime: orchestrator, automation, alerts, PR monitor
// ---------------------------------------------------------------------------

function createRuntimeServices(
  configStore: ConfigStore,
  infra: InfrastructurePhase,
  workspace: WorkspaceDispatchPhase,
  events: EventNotificationPhase,
  templateAudit: TemplateAuditPhase,
  webhook: ReturnType<typeof initWebhookInfrastructure>,
  logger: ReturnType<typeof createLogger>,
) {
  const { persistence, tracker, repoRouter, gitManager } = infra;
  const { workspaceManager, agentRunner } = workspace;
  const { eventBus, automationStore, alertHistoryStore, notificationManager } = events;
  const { templateStore, issueConfigStore, resolveTemplate } = templateAudit;

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

  const automationRunner = new AutomationRunner({
    orchestrator,
    tracker,
    notificationManager,
    eventBus,
    store: automationStore,
    logger: logger.child({ component: "automation-runner" }),
  });

  const automationScheduler = new AutomationScheduler({
    configStore,
    runner: automationRunner,
    notificationManager,
    logger: logger.child({ component: "automation-scheduler" }),
  });

  const alertEngine = new AlertEngine({
    configStore,
    eventBus,
    notificationManager,
    historyStore: alertHistoryStore,
    logger: logger.child({ component: "alert-engine" }),
  });

  const prMonitor = new PrMonitorService({
    store: persistence.attemptStore,
    ghClient: gitManager as unknown as PrMonitorGhClient,
    tracker,
    workspaceManager,
    getConfig: () => configStore.getConfig().agent,
    logger: logger.child({ component: "pr-monitor" }),
    events: eventBus,
    orchestrator,
  });

  return { orchestrator, automationRunner, automationScheduler, alertEngine, prMonitor };
}

// ---------------------------------------------------------------------------
// Phase 7 — HTTP layer
// ---------------------------------------------------------------------------

function createHttpLayer(
  configStore: ConfigStore,
  overlayStore: ConfigOverlayPort,
  secretsStore: SecretsStore,
  infra: InfrastructurePhase,
  events: EventNotificationPhase,
  templateAudit: TemplateAuditPhase,
  runtime: ReturnType<typeof createRuntimeServices>,
  webhook: ReturnType<typeof initWebhookInfrastructure>,
  archiveDir: string,
  logger: ReturnType<typeof createLogger>,
) {
  const { persistence, tracker } = infra;
  const { eventBus, notificationStore, automationStore, alertHistoryStore } = events;
  const { templateStore, auditLogger } = templateAudit;
  const { orchestrator, automationScheduler } = runtime;

  const httpServer = new HttpServer({
    orchestrator,
    logger: logger.child({ component: "http" }),
    tracker,
    configStore,
    configOverlayStore: overlayStore,
    secretsStore,
    eventBus,
    notificationStore,
    automationStore,
    automationScheduler,
    alertHistoryStore,
    attemptStore: persistence.attemptStore,
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

  return { httpServer };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Assemble all Risoluto services in dependency order.
 *
 * Phases execute sequentially; each phase receives only the outputs it
 * depends on, keeping wiring explicit and testable.
 */
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
  // Phase 1 — Infrastructure
  const infra = await createInfrastructure(configStore, secretsStore, archiveDir, logger, options);

  // Phase 2 — Workspace + Dispatch
  const workspace = createWorkspaceAndDispatch(configStore, infra, archiveDir, logger);

  // Phase 3 — Event + Notification
  const events = createEventAndNotification(infra.persistence, logger);

  // Phase 4 — Webhook
  const webhook = initWebhookInfrastructure({
    persistence: infra.persistence,
    webhookConfig: configStore.getConfig().webhook,
    linearClient: infra.linearClient,
    eventBus: events.eventBus,
    secretsStore,
    logger,
  });

  // Phase 5 — Template + Audit
  const templateAudit = createTemplateAndAudit(configStore, infra.persistence, events.eventBus, logger);

  // Phase 6 — Runtime services
  const runtime = createRuntimeServices(configStore, infra, workspace, events, templateAudit, webhook, logger);

  // Phase 7 — HTTP layer
  const { httpServer } = createHttpLayer(
    configStore,
    overlayStore,
    secretsStore,
    infra,
    events,
    templateAudit,
    runtime,
    webhook,
    archiveDir,
    logger,
  );

  return {
    orchestrator: runtime.orchestrator,
    httpServer,
    notificationManager: events.notificationManager,
    linearClient: infra.linearClient,
    eventBus: events.eventBus,
    notificationStore: events.notificationStore,
    automationStore: events.automationStore,
    alertHistoryStore: events.alertHistoryStore,
    automationScheduler: runtime.automationScheduler,
    persistence: infra.persistence,
    webhookHealthTracker: webhook.webhookHealthTracker,
    webhookRegistrar: webhook.webhookRegistrar,
    alertEngine: runtime.alertEngine,
    webhookInbox: webhook.webhookInbox,
    prMonitor: runtime.prMonitor,
  };
}
