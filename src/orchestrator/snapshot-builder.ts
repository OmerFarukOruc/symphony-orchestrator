import { buildWorkflowColumns } from "../workflow/columns.js";
import { computeAttemptCostUsd } from "../core/model-pricing.js";
import { nowIso } from "./views.js";
import { buildRunningIssueView, buildRetryIssueView } from "./issue-view-builders.js";
export { buildRunningIssueView, buildRetryIssueView } from "./issue-view-builders.js";
import { type IssueLocatorCallbacks, resolveIssue, toIssueView } from "./issue-locator.js";
import type {
  AttemptRecord,
  RecentEvent,
  RuntimeIssueView,
  RuntimeSnapshot,
  ServiceConfig,
  ModelSelection,
  StallEventView,
  SystemHealth,
} from "../core/types.js";
import type { RunningEntry, RetryRuntimeEntry } from "./runtime-types.js";

export interface AttemptSummary {
  attemptId: string;
  attemptNumber: number | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  model: string;
  reasoningEffort: string | null;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
  costUsd: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  issueIdentifier?: string;
  title?: string;
  workspacePath?: string | null;
  workspaceKey?: string | null;
  modelSource?: string;
  turnCount?: number;
  threadId?: string | null;
  turnId?: string | null;
}

export interface AttemptAppServerView {
  effectiveProvider: string | null;
  effectiveModel: string | null;
  reasoningEffort: string | null;
  approvalPolicy: string | null;
  threadName: string | null;
  threadStatus: string | null;
  threadStatusPayload: Record<string, unknown> | null;
  allowedApprovalPolicies: string[] | null;
  allowedSandboxModes: string[] | null;
  networkRequirements: Record<string, unknown> | null;
}

export interface SnapshotBuilderDeps {
  attemptStore: {
    getAttempt: (attemptId: string) => AttemptRecord | null;
    getEvents: (attemptId: string) => RecentEvent[];
    getAttemptsForIssue: (issueIdentifier: string) => AttemptRecord[];
    sumArchivedSeconds: () => number;
    sumCostUsd: () => number;
    sumArchivedTokens: () => { inputTokens: number; outputTokens: number; totalTokens: number };
  };
}

export interface SnapshotBuilderCallbacks {
  getConfig: () => ServiceConfig;
  resolveModelSelection: (identifier: string) => ModelSelection;
  getDetailViews: () => Map<string, RuntimeIssueView>;
  getCompletedViews: () => Map<string, RuntimeIssueView>;
  getRunningEntries: () => Map<string, RunningEntry>;
  getRetryEntries: () => Map<string, RetryRuntimeEntry>;
  getQueuedViews: () => RuntimeIssueView[];
  getRecentEvents: () => RecentEvent[];
  getRateLimits: () => unknown;
  getCodexTotals: () => {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    secondsRunning: number;
    costUsd?: number;
  };
  getStallEvents?: () => StallEventView[];
  getSystemHealth?: () => SystemHealth | null;
  getWebhookHealth?: () => RuntimeSnapshot["webhookHealth"] | undefined;
  getTemplateOverride?: (identifier: string) => string | null;
  getTemplateName?: (templateId: string) => string | null;
}

// Builds a runtime snapshot from orchestrator state.
// Pure read-path logic extracted for testability and modularity.
export function buildSnapshot(deps: SnapshotBuilderDeps, callbacks: SnapshotBuilderCallbacks): RuntimeSnapshot {
  const running = [...callbacks.getRunningEntries().values()].map((entry) =>
    buildRunningIssueView(entry, callbacks.resolveModelSelection),
  );
  const retrying = [...callbacks.getRetryEntries().values()].map((entry) =>
    buildRetryIssueView(entry, callbacks.resolveModelSelection),
  );
  const queued = callbacks.getQueuedViews();
  const completed = [...callbacks.getCompletedViews().values()]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 25);
  const codexTotals = callbacks.getCodexTotals();

  return {
    generatedAt: nowIso(),
    counts: {
      running: callbacks.getRunningEntries().size,
      retrying: callbacks.getRetryEntries().size,
    },
    running,
    retrying,
    queued,
    completed,
    workflowColumns: buildWorkflowColumns(callbacks.getConfig(), {
      running,
      retrying,
      queued,
      completed: [...completed, ...callbacks.getDetailViews().values()],
    }),
    codexTotals: {
      inputTokens: computeArchivedTokenField(deps.attemptStore, codexTotals, "inputTokens"),
      outputTokens: computeArchivedTokenField(deps.attemptStore, codexTotals, "outputTokens"),
      totalTokens: computeArchivedTokenField(deps.attemptStore, codexTotals, "totalTokens"),
      secondsRunning: computeSecondsRunning(deps.attemptStore, () => callbacks.getRunningEntries()),
      costUsd: computeCostUsd(deps.attemptStore, () => callbacks.getRunningEntries()),
    },
    rateLimits: callbacks.getRateLimits(),
    recentEvents: [...callbacks.getRecentEvents()],
    stallEvents: callbacks.getStallEvents ? [...callbacks.getStallEvents()] : undefined,
    systemHealth: callbacks.getSystemHealth ? (callbacks.getSystemHealth() ?? undefined) : undefined,
    webhookHealth: callbacks.getWebhookHealth ? callbacks.getWebhookHealth() : undefined,
  };
}

/** Typed detail view for a single issue, including its attempt history and live events. */
export interface IssueDetailView extends RuntimeIssueView {
  recentEvents: RecentEvent[];
  attempts: AttemptSummary[];
  currentAttemptId: string | null;
}

function resolveRelatedEvents(
  identifier: string,
  archivedAttempts: AttemptRecord[],
  runningEntry: RunningEntry | null,
  retryEntry: RetryRuntimeEntry | null,
  deps: SnapshotBuilderDeps,
  callbacks: SnapshotBuilderCallbacks,
): RecentEvent[] {
  if (runningEntry) return deps.attemptStore.getEvents(runningEntry.runId);
  if (retryEntry || archivedAttempts.length === 0) {
    return callbacks.getRecentEvents().filter((event) => event.issueIdentifier === identifier);
  }
  return archivedAttempts.flatMap((attempt) => deps.attemptStore.getEvents(attempt.attemptId));
}

function enrichFromArchive(detail: RuntimeIssueView, archivedAttempts: AttemptRecord[]): RuntimeIssueView {
  if (archivedAttempts.length === 0) return detail;
  const enriched: RuntimeIssueView = { ...detail };
  if (!enriched.tokenUsage) {
    enriched.tokenUsage = archivedAttempts.reduce(
      (acc, attempt) => {
        if (!attempt.tokenUsage) return acc;
        return {
          inputTokens: acc.inputTokens + attempt.tokenUsage.inputTokens,
          outputTokens: acc.outputTokens + attempt.tokenUsage.outputTokens,
          totalTokens: acc.totalTokens + attempt.tokenUsage.totalTokens,
        };
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    );
  }
  if (!enriched.startedAt) {
    enriched.startedAt = archivedAttempts.at(0)?.startedAt ?? null;
  }
  return enriched;
}

// Builds issue detail view including archived attempts.
export function buildIssueDetail(
  identifier: string,
  deps: SnapshotBuilderDeps,
  callbacks: SnapshotBuilderCallbacks,
): IssueDetailView | null {
  const locatorCallbacks: IssueLocatorCallbacks = {
    getRunningEntries: callbacks.getRunningEntries,
    getRetryEntries: callbacks.getRetryEntries,
    getCompletedViews: callbacks.getCompletedViews,
    getDetailViews: callbacks.getDetailViews,
    resolveModelSelection: callbacks.resolveModelSelection,
  };
  const location = resolveIssue(identifier, locatorCallbacks);
  if (!location) {
    return null;
  }

  const detail = toIssueView(location, locatorCallbacks);
  const runningEntry = location.kind === "running" ? location.entry : null;
  const retryEntry = location.kind === "retry" ? location.entry : null;

  const archivedAttempts = deps.attemptStore.getAttemptsForIssue(identifier);
  const relatedEvents = resolveRelatedEvents(identifier, archivedAttempts, runningEntry, retryEntry, deps, callbacks);
  const enriched = enrichFromArchive(detail, archivedAttempts);

  const templateId = callbacks.getTemplateOverride ? callbacks.getTemplateOverride(identifier) : null;
  const templateName = templateId && callbacks.getTemplateName ? callbacks.getTemplateName(templateId) : null;

  return {
    ...enriched,
    configuredTemplateId: templateId,
    configuredTemplateName: templateName,
    recentEvents: relatedEvents,
    attempts: archivedAttempts.map((attempt) => buildAttemptSummary(attempt)),
    currentAttemptId: runningEntry?.runId ?? null,
  };
}

/** Typed detail view for a single attempt, including its event stream. */
export interface AttemptDetailView extends AttemptSummary {
  events: RecentEvent[];
  appServer?: AttemptAppServerView;
}

// Builds attempt detail view with events.
export function buildAttemptDetail(attemptId: string, deps: SnapshotBuilderDeps): AttemptDetailView | null {
  const attempt = deps.attemptStore.getAttempt(attemptId);
  if (!attempt) {
    return null;
  }
  const events = deps.attemptStore.getEvents(attemptId);
  return {
    ...buildAttemptSummary(attempt),
    events,
    appServer: buildAttemptAppServer(attempt, events),
  };
}

// Computes total seconds running from archived attempts and live entries.
export function computeSecondsRunning(
  attemptStore: SnapshotBuilderDeps["attemptStore"],
  getRunningEntries: () => Map<string, RunningEntry>,
): number {
  const archivedSeconds = attemptStore.sumArchivedSeconds();
  const liveSeconds = [...getRunningEntries().values()].reduce(
    (total, entry) => total + Math.max(0, (Date.now() - entry.startedAtMs) / 1000),
    0,
  );
  return archivedSeconds + liveSeconds;
}

// Computes total cost in USD from archived attempts plus in-flight running workers.
export function computeCostUsd(
  attemptStore: SnapshotBuilderDeps["attemptStore"],
  getRunningEntries?: () => Map<string, RunningEntry>,
): number {
  const archivedCost = attemptStore.sumCostUsd();
  if (!getRunningEntries) return archivedCost;
  const liveCost = [...getRunningEntries().values()].reduce((total, entry) => {
    const cost = computeAttemptCostUsd({
      model: entry.modelSelection.model,
      tokenUsage: entry.tokenUsage ?? null,
    });
    return total + (cost ?? 0);
  }, 0);
  return archivedCost + liveCost;
}

// Returns the greater of the archived token count and the live in-memory counter.
// Live counters can race ahead of archived data when workers are still running,
// but after a restart the in-memory counters reset to 0 while archives persist.
function computeArchivedTokenField(
  attemptStore: SnapshotBuilderDeps["attemptStore"],
  liveCodexTotals: { inputTokens: number; outputTokens: number; totalTokens: number },
  field: "inputTokens" | "outputTokens" | "totalTokens",
): number {
  const archived = attemptStore.sumArchivedTokens();
  return Math.max(archived[field], liveCodexTotals[field]);
}

// Builds a minimal attempt summary from an AttemptRecord.
function buildAttemptSummary(attempt: AttemptRecord): AttemptSummary {
  const costUsd = computeAttemptCostUsd(attempt);
  return {
    attemptId: attempt.attemptId,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    endedAt: attempt.endedAt,
    status: attempt.status,
    model: attempt.model,
    reasoningEffort: attempt.reasoningEffort,
    tokenUsage: attempt.tokenUsage,
    costUsd,
    errorCode: attempt.errorCode,
    errorMessage: attempt.errorMessage,
    issueIdentifier: attempt.issueIdentifier,
    title: attempt.title,
    workspacePath: attempt.workspacePath,
    workspaceKey: attempt.workspaceKey,
    modelSource: attempt.modelSource,
    turnCount: attempt.turnCount,
    threadId: attempt.threadId,
    turnId: attempt.turnId,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const strings = value.filter((entry): entry is string => typeof entry === "string");
  return strings;
}

function findLatestEvent(events: RecentEvent[], eventName: string): RecentEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.event === eventName) {
      return events[index] ?? null;
    }
  }
  return null;
}

function extractThreadStatusPayload(event: RecentEvent | null): Record<string, unknown> | null {
  const metadata = asRecord(event?.metadata);
  return asRecord(metadata?.threadStatus) ?? asRecord(metadata?.status);
}

function hasAppServerData(value: AttemptAppServerView): boolean {
  return Object.values(value).some((entry) => entry !== null);
}

function buildConfigSummary(
  attempt: AttemptRecord,
  events: RecentEvent[],
): Pick<AttemptAppServerView, "effectiveProvider" | "effectiveModel" | "reasoningEffort" | "approvalPolicy"> {
  const configMetadata = asRecord(findLatestEvent(events, "codex_config_loaded")?.metadata);
  return {
    effectiveProvider: asString(configMetadata?.modelProvider),
    effectiveModel: asString(configMetadata?.model) ?? attempt.model,
    reasoningEffort: asString(configMetadata?.reasoningEffort) ?? attempt.reasoningEffort,
    approvalPolicy: asString(configMetadata?.approvalPolicy),
  };
}

function buildRequirementsSummary(
  events: RecentEvent[],
): Pick<AttemptAppServerView, "allowedApprovalPolicies" | "allowedSandboxModes" | "networkRequirements"> {
  const requirementsMetadata = asRecord(findLatestEvent(events, "codex_requirements_loaded")?.metadata);
  return {
    allowedApprovalPolicies: asStringArray(requirementsMetadata?.allowedApprovalPolicies),
    allowedSandboxModes: asStringArray(requirementsMetadata?.allowedSandboxModes),
    networkRequirements: asRecord(requirementsMetadata?.network),
  };
}

function buildThreadSummary(
  events: RecentEvent[],
): Pick<AttemptAppServerView, "threadName" | "threadStatus" | "threadStatusPayload"> {
  const threadLoadedMetadata = asRecord(findLatestEvent(events, "thread_loaded")?.metadata);
  const threadLoadedStatus = asRecord(threadLoadedMetadata?.status);
  const threadStatusPayload =
    extractThreadStatusPayload(findLatestEvent(events, "thread_status")) ?? threadLoadedStatus ?? null;
  return {
    threadName: asString(threadLoadedMetadata?.name),
    threadStatus: asString(threadStatusPayload?.type),
    threadStatusPayload,
  };
}

function buildAttemptAppServer(attempt: AttemptRecord, events: RecentEvent[]): AttemptAppServerView | undefined {
  const summary: AttemptAppServerView = {
    ...buildConfigSummary(attempt, events),
    ...buildThreadSummary(events),
    ...buildRequirementsSummary(events),
  };

  return hasAppServerData(summary) ? summary : undefined;
}
