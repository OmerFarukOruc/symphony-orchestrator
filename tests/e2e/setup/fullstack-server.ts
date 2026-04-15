/**
 * Global setup/teardown for the fullstack Playwright project.
 *
 * Builds the project (backend + frontend), then starts a real HttpServer
 * backed by a temp directory. The built frontend is served from
 * `dist/frontend` via Express static middleware.
 *
 * Stores `FULLSTACK_BASE_URL` and `FULLSTACK_WEBHOOK_SECRET` in
 * `process.env` so the fullstack fixture can read them.
 *
 * Returns a teardown function (Playwright 1.34+ pattern) that stops
 * the server, destroys the event bus, and cleans up the temp dir.
 */

import { execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { FullConfig } from "@playwright/test";

import { TypedEventBus } from "../../../src/core/event-bus.js";
import type { RisolutoEventMap } from "../../../src/core/risoluto-events.js";
import type { Issue, RecentEvent, RisolutoLogger, RuntimeIssueView, RuntimeSnapshot } from "../../../src/core/types.js";
import { HttpServer } from "../../../src/http/server.js";
import type { LinearWebhookPayload } from "../../../src/http/webhook-types.js";
import type { AttemptDetailView, AttemptSummary, IssueDetailView } from "../../../src/orchestrator/snapshot-builder.js";
import { serializeSnapshot } from "../../../src/orchestrator/snapshot-serialization.js";

const WEBHOOK_SECRET = "fullstack-test-webhook-secret";
const RECENT_EVENT_LIMIT = 50;
const FALLBACK_POLLING_MS = 5_000;
const CONNECTED_POLLING_MS = 30_000;

interface WebhookIssueContext {
  issueId: string | null;
  issueIdentifier: string | null;
  title: string | null;
  state: string | null;
}

interface FullstackState {
  issues: Issue[];
  attempts: AttemptDetailView[];
  events: RecentEvent[];
  deliveryIds: Set<string>;
  latestWebhookIssue: WebhookIssueContext | null;
  webhookStats: {
    deliveriesReceived: number;
    lastDeliveryAt: string | null;
    lastEventType: string | null;
  };
}

function buildSilentLogger(): RisolutoLogger {
  const noop = () => {};
  const logger: RisolutoLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isTerminalState(state: string): boolean {
  return ["done", "cancelled", "canceled", "archived", "closed"].includes(state.toLowerCase());
}

function isRunningState(state: string): boolean {
  return ["in progress", "active", "running"].includes(state.toLowerCase());
}

function collapseNonWordSequences(value: string): { output: string[]; lastWasDash: boolean } {
  return Array.from(value).reduce<{ output: string[]; lastWasDash: boolean }>(
    (result, character) => {
      if (/^[\w.-]$/.test(character)) {
        result.output.push(character);
        result.lastWasDash = false;
        return result;
      }
      if (!result.lastWasDash) {
        result.output.push("-");
        result.lastWasDash = true;
      }
      return result;
    },
    { output: [] as string[], lastWasDash: false },
  );
}

function toWorkflowKey(state: string): string {
  const collapsed = collapseNonWordSequences(state.trim().toLowerCase());
  let normalized = collapsed.output.join("");
  // short state strings, no DoS risk
  normalized = normalized.replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function toWorkflowKind(state: string): RuntimeSnapshot["workflowColumns"][number]["kind"] {
  if (isTerminalState(state)) {
    return "terminal";
  }
  if (isRunningState(state)) {
    return "active";
  }
  if (["triage", "backlog", "todo"].includes(state.toLowerCase())) {
    return "backlog";
  }
  return "other";
}

function buildRecentEvent(input: {
  issueId: string | null;
  issueIdentifier: string | null;
  event: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}): RecentEvent {
  return {
    at: nowIso(),
    issueId: input.issueId,
    issueIdentifier: input.issueIdentifier,
    sessionId: null,
    event: input.event,
    message: input.message,
    content: null,
    metadata: input.metadata ?? null,
  };
}

function pushRecentEvent(state: FullstackState, event: RecentEvent): void {
  state.events.push(event);
  if (state.events.length > RECENT_EVENT_LIMIT) {
    state.events.splice(0, state.events.length - RECENT_EVENT_LIMIT);
  }
}

function parseWebhookIssue(payloadJson: string | null): WebhookIssueContext | null {
  if (!payloadJson) {
    return null;
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(payloadJson) as LinearWebhookPayload;
  } catch {
    return null;
  }

  const data = payload.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const issueData = payload.type === "Issue" ? data : ((data.issue as Record<string, unknown> | undefined) ?? null);
  if (!issueData) {
    return null;
  }

  const issueId = typeof issueData.id === "string" ? issueData.id : null;
  const issueIdentifier = typeof issueData.identifier === "string" ? issueData.identifier : null;
  const title = typeof issueData.title === "string" ? issueData.title : null;
  const stateValue = issueData.state as Record<string, unknown> | undefined;
  const stateName = typeof stateValue?.name === "string" ? stateValue.name : null;

  return {
    issueId,
    issueIdentifier,
    title,
    state: stateName,
  };
}

function buildIssueFromContext(context: WebhookIssueContext): Issue {
  const timestamp = nowIso();
  return {
    id: context.issueId ?? `issue-${context.issueIdentifier ?? "unknown"}`,
    identifier: context.issueIdentifier ?? context.issueId ?? "UNKNOWN",
    title: context.title ?? context.issueIdentifier ?? "Untitled fullstack issue",
    description: null,
    priority: null,
    state: context.state ?? "Triage",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function latestAttemptForIssue(state: FullstackState, identifier: string): AttemptDetailView | null {
  const attempts = state.attempts.filter((attempt) => attempt.issueIdentifier === identifier);
  return attempts.length > 0 ? (attempts[attempts.length - 1] ?? null) : null;
}

function getLastEventAt(state: FullstackState, identifier: string): string | null {
  const relatedEvents = state.events.filter((event) => event.issueIdentifier === identifier);
  if (relatedEvents.length === 0) {
    return null;
  }
  return relatedEvents[relatedEvents.length - 1]?.at ?? null;
}

function toRuntimeReasoningEffort(value: string | null): RuntimeIssueView["reasoningEffort"] {
  if (
    value === null ||
    value === "none" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  ) {
    return value;
  }
  return null;
}

function toRuntimeModelSource(value: string | undefined): RuntimeIssueView["modelSource"] {
  if (value === "default" || value === "override") {
    return value;
  }
  return null;
}

function upsertIssue(state: FullstackState, context: WebhookIssueContext): Issue {
  const nextIssue = buildIssueFromContext(context);
  const existingIndex = state.issues.findIndex((issue) => issue.identifier === nextIssue.identifier);
  if (existingIndex === -1) {
    state.issues.push(nextIssue);
    return nextIssue;
  }

  const existing = state.issues[existingIndex];
  const merged: Issue = {
    ...existing,
    id: nextIssue.id,
    title: nextIssue.title,
    state: nextIssue.state,
    updatedAt: nowIso(),
  };
  state.issues[existingIndex] = merged;
  return merged;
}

function syncAttemptState(state: FullstackState, issue: Issue): string | null {
  const latestAttempt = latestAttemptForIssue(state, issue.identifier);

  if (isRunningState(issue.state)) {
    if (latestAttempt && latestAttempt.status === "running") {
      return latestAttempt.attemptId;
    }

    const attemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;
    const attemptId = `${issue.identifier.toLowerCase()}-attempt-${attemptNumber}`;
    state.attempts.push({
      attemptId,
      attemptNumber,
      startedAt: nowIso(),
      endedAt: null,
      status: "running",
      model: "gpt-5.4",
      reasoningEffort: null,
      tokenUsage: null,
      costUsd: null,
      errorCode: null,
      errorMessage: null,
      issueIdentifier: issue.identifier,
      title: issue.title,
      workspacePath: null,
      workspaceKey: null,
      modelSource: "default",
      turnCount: 0,
      threadId: null,
      turnId: null,
      events: [],
    });
    return attemptId;
  }

  if (isTerminalState(issue.state) && latestAttempt && latestAttempt.status === "running") {
    latestAttempt.status = "completed";
    latestAttempt.endedAt = nowIso();
    return latestAttempt.attemptId;
  }

  return latestAttempt?.attemptId ?? null;
}

function buildIssueViewCore(
  issue: Issue,
  status: RuntimeIssueView["status"],
  lastEventAt: string | null,
): RuntimeIssueView {
  return {
    issueId: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state,
    workspaceKey: null,
    workspacePath: null,
    message: `State synced from webhook: ${issue.state}`,
    status,
    updatedAt: issue.updatedAt ?? nowIso(),
    attempt: null,
    error: null,
    priority: issue.priority,
    labels: issue.labels,
    startedAt: null,
    lastEventAt,
    tokenUsage: null,
    model: null,
    reasoningEffort: null,
    modelSource: null,
    configuredModel: null,
    configuredReasoningEffort: null,
    configuredModelSource: null,
    modelChangePending: false,
    configuredTemplateId: null,
    configuredTemplateName: null,
    url: issue.url,
    description: issue.description,
    blockedBy: issue.blockedBy,
    branchName: issue.branchName,
    pullRequestUrl: null,
    createdAt: issue.createdAt,
  };
}

function buildIssueView(state: FullstackState, issue: Issue): RuntimeIssueView {
  const currentAttempt = latestAttemptForIssue(state, issue.identifier);
  const status = isTerminalState(issue.state) ? "completed" : isRunningState(issue.state) ? "running" : "queued";
  const lastEventAt = getLastEventAt(state, issue.identifier);

  if (!currentAttempt) {
    return buildIssueViewCore(issue, status, lastEventAt);
  }

  return {
    ...buildIssueViewCore(issue, status, lastEventAt),
    attempt: currentAttempt.attemptNumber ?? null,
    startedAt: currentAttempt.startedAt ?? null,
    tokenUsage: currentAttempt.tokenUsage ?? null,
    model: currentAttempt.model ?? null,
    reasoningEffort: toRuntimeReasoningEffort(currentAttempt.reasoningEffort ?? null),
    modelSource: toRuntimeModelSource(currentAttempt.modelSource),
    configuredModel: currentAttempt.model ?? null,
    configuredReasoningEffort: toRuntimeReasoningEffort(currentAttempt.reasoningEffort ?? null),
    configuredModelSource: toRuntimeModelSource(currentAttempt.modelSource),
  };
}

function buildWorkflowColumns(issueViews: RuntimeIssueView[]): RuntimeSnapshot["workflowColumns"] {
  const byState = new Map<string, RuntimeIssueView[]>();
  for (const issue of issueViews) {
    const existing = byState.get(issue.state) ?? [];
    existing.push(issue);
    byState.set(issue.state, existing);
  }

  return [...byState.entries()].map(([label, issues]) => ({
    key: toWorkflowKey(label),
    label,
    kind: toWorkflowKind(label),
    terminal: isTerminalState(label),
    count: issues.length,
    issues,
  }));
}

function buildSnapshot(state: FullstackState): RuntimeSnapshot {
  const issueViews = state.issues.map((issue) => buildIssueView(state, issue));
  const running = issueViews.filter((issue) => issue.status === "running");
  const completed = issueViews.filter((issue) => issue.status === "completed");
  const queued = issueViews.filter((issue) => issue.status === "queued");

  return {
    generatedAt: nowIso(),
    counts: {
      running: running.length,
      retrying: 0,
    },
    running,
    retrying: [],
    queued,
    completed,
    workflowColumns: buildWorkflowColumns(issueViews),
    codexTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0,
      costUsd: 0,
    },
    rateLimits: null,
    recentEvents: [...state.events],
    webhookHealth: {
      status: state.webhookStats.deliveriesReceived > 0 ? "connected" : "degraded",
      effectiveIntervalMs: state.webhookStats.deliveriesReceived > 0 ? CONNECTED_POLLING_MS : FALLBACK_POLLING_MS,
      stats: {
        deliveriesReceived: state.webhookStats.deliveriesReceived,
        lastDeliveryAt: state.webhookStats.lastDeliveryAt,
        lastEventType: state.webhookStats.lastEventType,
      },
      lastDeliveryAt: state.webhookStats.lastDeliveryAt,
      lastEventType: state.webhookStats.lastEventType,
    },
  };
}

function buildIssueDetail(state: FullstackState, identifier: string): IssueDetailView | null {
  const issue = state.issues.find((candidate) => candidate.identifier === identifier);
  if (!issue) {
    return null;
  }

  const attempts = state.attempts
    .filter((attempt) => attempt.issueIdentifier === identifier)
    .map<AttemptSummary>((attempt) => ({
      attemptId: attempt.attemptId,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      endedAt: attempt.endedAt,
      status: attempt.status,
      model: attempt.model,
      reasoningEffort: attempt.reasoningEffort,
      tokenUsage: attempt.tokenUsage,
      costUsd: attempt.costUsd,
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
    }));

  return {
    ...buildIssueView(state, issue),
    recentEvents: state.events.filter((event) => event.issueIdentifier === identifier),
    attempts,
    currentAttemptId:
      latestAttemptForIssue(state, identifier)?.status === "running"
        ? (latestAttemptForIssue(state, identifier)?.attemptId ?? null)
        : null,
  };
}

function applyWebhookIssueUpdate(
  state: FullstackState,
  eventBus: TypedEventBus<RisolutoEventMap>,
  reason: string,
  fallback?: { issueId: string; issueIdentifier: string },
): { issue: Issue; currentAttemptId: string | null } | null {
  const context = state.latestWebhookIssue ?? {
    issueId: fallback?.issueId ?? null,
    issueIdentifier: fallback?.issueIdentifier ?? null,
    title: fallback?.issueIdentifier ?? null,
    state: "Triage",
  };

  if (!context.issueIdentifier && !context.issueId) {
    return null;
  }

  const issue = upsertIssue(state, context);
  const currentAttemptId = syncAttemptState(state, issue);
  pushRecentEvent(
    state,
    buildRecentEvent({
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      event: "issue_queued",
      message: `Webhook requested refresh (${reason})`,
      metadata: { reason, state: issue.state },
    }),
  );
  eventBus.emit("issue.queued", { issueId: issue.id, identifier: issue.identifier });
  return { issue, currentAttemptId };
}

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  /* ---- build backend + frontend ---- */
  execSync("pnpm run build", {
    cwd: process.cwd(),
    stdio: "pipe",
    timeout: 120_000,
  });

  /* ---- temp directory for archives ---- */
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-fullstack-e2e-"));

  /* ---- event bus ---- */
  const eventBus = new TypedEventBus<RisolutoEventMap>();

  const state: FullstackState = {
    issues: [],
    attempts: [],
    events: [],
    deliveryIds: new Set(),
    latestWebhookIssue: null,
    webhookStats: {
      deliveriesReceived: 0,
      lastDeliveryAt: null,
      lastEventType: null,
    },
  };

  /* ---- stub orchestrator (minimal for serving routes) ---- */
  const orchestrator = {
    start: async () => {},
    stop: async () => {},
    requestRefresh: (reason: string) => {
      applyWebhookIssueUpdate(state, eventBus, reason);
      return {
        queued: false,
        coalesced: false,
        requestedAt: nowIso(),
      };
    },
    requestTargetedRefresh: (issueId: string, issueIdentifier: string, reason: string) => {
      applyWebhookIssueUpdate(state, eventBus, reason, { issueId, issueIdentifier });
    },
    stopWorkerForIssue: (issueIdentifier: string, reason: string) => {
      const issue = state.issues.find((candidate) => candidate.identifier === issueIdentifier);
      if (!issue) {
        return;
      }
      syncAttemptState(state, issue);
      pushRecentEvent(
        state,
        buildRecentEvent({
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          event: "issue_completed",
          message: `Worker stop requested (${reason})`,
          metadata: { reason, state: issue.state },
        }),
      );
      eventBus.emit("issue.completed", { issueId: issue.id, identifier: issue.identifier, outcome: issue.state });
    },
    getSnapshot: () => buildSnapshot(state),
    getSerializedState: () => serializeSnapshot(buildSnapshot(state) as RuntimeSnapshot & Record<string, unknown>),
    getIssueDetail: (identifier: string) => buildIssueDetail(state, identifier),
    getAttemptDetail: (attemptId: string) => state.attempts.find((attempt) => attempt.attemptId === attemptId) ?? null,
    abortIssue: () => ({ ok: false as const, code: "not_found" as const, message: "stub" }),
    updateIssueModelSelection: async () => null,
    steerIssue: async () => null,
    getTemplateOverride: () => null,
    updateIssueTemplateOverride: () => false,
    clearIssueTemplateOverride: () => false,
    getIssues: () => [...state.issues],
    getEvents: () => [...state.events],
    getRecoveryReport: () => null,
  };

  /* ---- webhook handler deps ---- */
  const logger = buildSilentLogger();
  const webhookHandlerDeps = {
    getWebhookSecret: () => WEBHOOK_SECRET,
    getPreviousWebhookSecret: () => null,
    webhookInbox: {
      insertVerified: async (delivery: { deliveryId: string; payloadJson: string | null }) => {
        if (state.deliveryIds.has(delivery.deliveryId)) {
          return { isNew: false };
        }
        state.deliveryIds.add(delivery.deliveryId);
        state.latestWebhookIssue = parseWebhookIssue(delivery.payloadJson);
        return { isNew: true };
      },
    },
    requestRefresh: (reason: string) => {
      orchestrator.requestRefresh(reason);
    },
    requestTargetedRefresh: (issueId: string, issueIdentifier: string, reason: string) => {
      orchestrator.requestTargetedRefresh(issueId, issueIdentifier, reason);
    },
    stopWorkerForIssue: (issueIdentifier: string, reason: string) => {
      orchestrator.stopWorkerForIssue(issueIdentifier, reason);
    },
    recordVerifiedDelivery: (eventType: string) => {
      const timestamp = nowIso();
      state.webhookStats.deliveriesReceived += 1;
      state.webhookStats.lastDeliveryAt = timestamp;
      state.webhookStats.lastEventType = eventType;
      pushRecentEvent(
        state,
        buildRecentEvent({
          issueId: state.latestWebhookIssue?.issueId ?? null,
          issueIdentifier: state.latestWebhookIssue?.issueIdentifier ?? null,
          event: "webhook_received",
          message: `Verified webhook received (${eventType})`,
          metadata: { eventType },
        }),
      );
      eventBus.emit("webhook.received", { eventType, timestamp });
    },
    logger,
  };

  /* ---- start server ---- */
  const frontendDir = path.join(process.cwd(), "dist/frontend");
  const server = new HttpServer({
    orchestrator,
    logger,
    eventBus,
    webhookHandlerDeps,
    frontendDir,
    archiveDir: dataDir,
  });

  const { port } = await server.start(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  /* ---- expose to fixtures via environment ---- */
  process.env.FULLSTACK_BASE_URL = baseUrl;
  process.env.FULLSTACK_WEBHOOK_SECRET = WEBHOOK_SECRET;

  /* ---- return teardown function ---- */
  return async () => {
    await server.stop();
    eventBus.destroy();
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
    delete process.env.FULLSTACK_BASE_URL;
    delete process.env.FULLSTACK_WEBHOOK_SECRET;
  };
}
