import { AuditLogger } from "../audit/logger.js";
import { createMetricsCollector } from "../observability/metrics.js";
import { createObservabilityHub } from "../observability/hub.js";
import { AlertEngine } from "../alerts/engine.js";
import type { AlertHistoryStorePort } from "../alerts/history-store.js";
import { AutomationRunner } from "../automation/runner.js";
import { AutomationScheduler } from "../automation/scheduler.js";
import { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import { CodexControlPlane } from "../codex/control-plane.js";
import type { RisolutoLogger, WebhookConfig } from "../core/types.js";
import { PromptTemplateStore } from "../prompt/store.js";
import { createTemplateResolver } from "../prompt/resolver.js";
import { createGitHubToolProvider, createRepoRouterProvider } from "./runtime-providers.js";
import type { ConfigOverlayPort } from "../config/overlay.js";
import type { ConfigStore } from "../config/store.js";
import { createDispatcher } from "../dispatch/factory.js";
import { HttpServer } from "../http/server.js";
import { NotificationManager } from "../notification/manager.js";
import { NotificationCenter } from "../notification/notification-center.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { initPersistenceRuntime, type PersistenceRuntime } from "../persistence/sqlite/runtime.js";
import { IssueConfigStore } from "../persistence/sqlite/issue-config-store.js";
import type { AutomationStorePort } from "../automation/port.js";
import type { NotificationStorePort } from "../notification/port.js";
import { PathRegistry } from "../workspace/path-registry.js";
import type { SecretsStore } from "../secrets/store.js";
import { createTracker } from "../tracker/factory.js";
import { WorkspaceManager } from "../workspace/manager.js";
import { PrMonitorService } from "../git/pr-monitor.js";
import { initWebhookInfrastructure, buildWebhookHandlerDeps } from "../webhook/composition.js";

export { evaluateWebhookConfig } from "../webhook/composition.js";
export type { WebhookConfig };

interface InfrastructurePhase {
  persistence: PersistenceRuntime;
  tracker: ReturnType<typeof createTracker>["tracker"];
  trackerToolProvider: ReturnType<typeof createTracker>["trackerToolProvider"];
  linearClient: ReturnType<typeof createTracker>["linearClient"];
  repoRouter: ReturnType<typeof createRepoRouterProvider>;
  gitManager: ReturnType<typeof createGitHubToolProvider>;
  metrics: ReturnType<typeof createMetricsCollector>;
  observability: ReturnType<typeof createObservabilityHub>;
}

interface WorkspaceDispatchPhase {
  workspaceManager: WorkspaceManager;
  pathRegistry: PathRegistry;
  agentRunner: ReturnType<typeof createDispatcher>;
}

interface EventNotificationPhase {
  eventBus: TypedEventBus<RisolutoEventMap>;
  notificationCenter: NotificationCenter;
  notificationStore: NotificationStorePort;
  automationStore: AutomationStorePort;
  alertHistoryStore: AlertHistoryStorePort;
  notificationManager: NotificationManager;
}

interface TemplateAuditPhase {
  templateStore: PromptTemplateStore;
  auditLogger: AuditLogger;
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
  logger: RisolutoLogger,
  options?: { persistence?: PersistenceRuntime },
): Promise<InfrastructurePhase> {
  const metrics = createMetricsCollector();
  const observability = createObservabilityHub({ archiveDir });
  const persistence = options?.persistence ?? (await initPersistenceRuntime({ dataDir: archiveDir, logger }));
  const { tracker, trackerToolProvider, linearClient } = createTracker(() => configStore.getConfig(), logger);
  const repoRouter = createRepoRouterProvider(() => configStore.getConfig());
  const gitManager = createGitHubToolProvider(() => configStore.getConfig(), {
    env: process.env,
    resolveSecret: (name) => secretsStore.get(name) ?? undefined,
  });

  return { persistence, tracker, trackerToolProvider, linearClient, repoRouter, gitManager, metrics, observability };
}

// ---------------------------------------------------------------------------
// Phase 2 — Workspace + Dispatch
// ---------------------------------------------------------------------------

function createWorkspaceAndDispatch(
  configStore: ConfigStore,
  infra: InfrastructurePhase,
  archiveDir: string,
  logger: RisolutoLogger,
): WorkspaceDispatchPhase {
  const { tracker, trackerToolProvider, gitManager, repoRouter, metrics } = infra;

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
    trackerToolProvider,
    workspaceManager,
    archiveDir,
    pathRegistry,
    githubToolClient: gitManager,
    logger,
    metrics,
  });

  return { workspaceManager, pathRegistry, agentRunner };
}

// ---------------------------------------------------------------------------
// Phase 3 — Event + Notification
// ---------------------------------------------------------------------------

function createEventAndNotification(
  configStore: ConfigStore,
  persistence: PersistenceRuntime,
  logger: RisolutoLogger,
): EventNotificationPhase {
  const eventBus = new TypedEventBus<RisolutoEventMap>();
  const { notificationStore, automationStore, alertHistoryStore } = persistence.operator;
  const notificationManager = new NotificationManager({
    logger: logger.child({ component: "notifications" }),
    eventBus,
    store: notificationStore,
  });
  const notificationCenter = new NotificationCenter({
    notificationStore,
    alertHistoryStore,
    configStore,
    logger: logger.child({ component: "notification-center" }),
  });

  return { eventBus, notificationCenter, notificationStore, automationStore, alertHistoryStore, notificationManager };
}

function createCodexControlPlane(
  configStore: ConfigStore,
  eventBus: TypedEventBus<RisolutoEventMap>,
  logger: RisolutoLogger,
): CodexControlPlane {
  return new CodexControlPlane(
    () => configStore.getConfig().codex,
    logger.child({ component: "codex-control-plane" }),
    eventBus,
  );
}

// ---------------------------------------------------------------------------
// Phase 5 — Template + Audit
// ---------------------------------------------------------------------------

function createTemplateAndAudit(
  configStore: ConfigStore,
  persistence: PersistenceRuntime,
  eventBus: TypedEventBus<RisolutoEventMap>,
  logger: RisolutoLogger,
): TemplateAuditPhase {
  const templateStore = new PromptTemplateStore(persistence.db, logger.child({ component: "templates" }));
  const auditLogger = new AuditLogger(persistence.db, eventBus);
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
  logger: RisolutoLogger,
) {
  const { persistence, tracker, repoRouter, gitManager, metrics, observability } = infra;
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
    metrics,
    observability,
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
    ghClient: gitManager,
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
  codexControlPlane: CodexControlPlane,
  templateAudit: TemplateAuditPhase,
  runtime: ReturnType<typeof createRuntimeServices>,
  webhook: ReturnType<typeof initWebhookInfrastructure>,
  archiveDir: string,
  logger: RisolutoLogger,
) {
  const { persistence, tracker, metrics, observability } = infra;
  const { eventBus, notificationCenter, notificationStore, automationStore, alertHistoryStore } = events;
  const { templateStore, auditLogger } = templateAudit;
  const { orchestrator, automationScheduler } = runtime;

  const httpServer = new HttpServer({
    orchestrator,
    logger: logger.child({ component: "http" }),
    tracker,
    codexControlPlane,
    configStore,
    configOverlayStore: overlayStore,
    secretsStore,
    eventBus,
    notificationCenter,
    notificationStore,
    automationStore,
    automationScheduler,
    alertHistoryStore,
    attemptStore: persistence.attemptStore,
    archiveDir,
    templateStore,
    auditLogger,
    metrics,
    observability,
    webhookHandlerDeps: webhook.webhookUrlSet
      ? buildWebhookHandlerDeps({
          orchestrator,
          webhook,
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
  logger: RisolutoLogger,
  options?: {
    persistence?: PersistenceRuntime;
  },
) {
  // Phase 1 — Infrastructure
  const infra = await createInfrastructure(configStore, secretsStore, archiveDir, logger, options);

  // Phase 2 — Workspace + Dispatch
  const workspace = createWorkspaceAndDispatch(configStore, infra, archiveDir, logger);

  // Phase 3 — Event + Notification
  const events = createEventAndNotification(configStore, infra.persistence, logger);

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

  // Phase 5.5 — Host-side Codex control plane
  const codexControlPlane = createCodexControlPlane(configStore, events.eventBus, logger);

  // Phase 6 — Runtime services
  const runtime = createRuntimeServices(configStore, infra, workspace, events, templateAudit, webhook, logger);

  // Phase 7 — HTTP layer
  const { httpServer } = createHttpLayer(
    configStore,
    overlayStore,
    secretsStore,
    infra,
    events,
    codexControlPlane,
    templateAudit,
    runtime,
    webhook,
    archiveDir,
    logger,
  );

  return {
    orchestrator: runtime.orchestrator,
    httpServer,
    codexControlPlane,
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
