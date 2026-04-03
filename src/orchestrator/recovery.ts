import { stat } from "node:fs/promises";

import { isActiveState, isTerminalState } from "../state/policy.js";
import { listContainersByWorkspace, removeContainer } from "../docker/lifecycle.js";
import { toErrorString } from "../utils/type-guards.js";
import type {
  AttemptRecord,
  AttemptEvent,
  AttemptCheckpointRecord,
  Issue,
  ModelSelection,
  ServiceConfig,
} from "../core/types.js";
import type { AttemptStorePort } from "../core/attempt-store-port.js";
import type { LaunchWorkerOptions } from "./runtime-types.js";
import type { RecoveryAction, RecoveryAssessment, RecoveryReport, RecoveryResult } from "./recovery-types.js";
import type { WorkspaceRemovalResult } from "../workspace/manager.js";

interface RecoveryContext {
  attemptStore: Pick<AttemptStorePort, "getAllAttempts" | "updateAttempt" | "appendEvent" | "appendCheckpoint">;
  tracker: { fetchIssueStatesByIds: (ids: string[]) => Promise<Issue[]> };
  workspaceManager: {
    removeWorkspace: (identifier: string, issue?: Issue) => Promise<void>;
    removeWorkspaceWithResult?: (identifier: string, issue?: Issue) => Promise<WorkspaceRemovalResult>;
  };
  getConfig: () => ServiceConfig;
  launchWorker: (issue: Issue, attempt: number | null, options?: LaunchWorkerOptions) => Promise<void>;
  logger: {
    info: (meta: Record<string, unknown>, message: string) => void;
    warn: (meta: Record<string, unknown>, message: string) => void;
  };
  inspectWorkspaceContainers?: (workspacePath: string) => Promise<Array<{ name: string; running: boolean }>>;
  removeContainer?: (name: string) => Promise<void>;
}

function latestRunningAttempts(attempts: AttemptRecord[]): AttemptRecord[] {
  const latestByIssue = new Map<string, AttemptRecord>();
  for (const attempt of attempts) {
    if (attempt.status !== "running") {
      continue;
    }
    const existing = latestByIssue.get(attempt.issueId);
    if (!existing || attempt.startedAt > existing.startedAt) {
      latestByIssue.set(attempt.issueId, attempt);
    }
  }
  return [...latestByIssue.values()];
}

function recoveryModelSelection(attempt: AttemptRecord): ModelSelection {
  return {
    model: attempt.model,
    reasoningEffort: attempt.reasoningEffort,
    source: attempt.modelSource,
  };
}

async function workspaceExists(workspacePath: string | null): Promise<boolean> {
  if (!workspacePath) {
    return false;
  }
  try {
    const info = await stat(workspacePath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

function assessAttempt(
  attempt: AttemptRecord,
  issue: Issue | null,
  config: ServiceConfig,
  flags: { workspaceExists: boolean; workerAlive: boolean; containerNames: string[] },
): RecoveryAssessment {
  let action: RecoveryAction;
  let reason: string;

  if (!issue) {
    action = "cleanup";
    reason = "Issue is no longer available from the tracker";
  } else if (isTerminalState(issue.state, config) || !isActiveState(issue.state, config)) {
    action = "cleanup";
    reason = `Issue state ${JSON.stringify(issue.state)} is no longer active`;
  } else if (!flags.workspaceExists) {
    action = "cleanup";
    reason = "Workspace is missing";
  } else if (attempt.threadId) {
    action = "resume";
    reason = flags.workerAlive
      ? "Orphaned container detected; restarting via thread resume"
      : "Workspace and thread id are intact; resume is possible";
  } else {
    action = "escalate";
    reason = "Workspace exists but the attempt has no resumable thread id";
  }

  return {
    attemptId: attempt.attemptId,
    issueId: attempt.issueId,
    issueIdentifier: attempt.issueIdentifier,
    persistedStatus: attempt.status,
    attemptNumber: attempt.attemptNumber,
    threadId: attempt.threadId,
    workspacePath: attempt.workspacePath,
    workspaceExists: flags.workspaceExists,
    workerAlive: flags.workerAlive,
    containerNames: flags.containerNames,
    action,
    reason,
  };
}

async function appendRecoveryEvent(
  attemptStore: RecoveryContext["attemptStore"],
  attempt: AttemptRecord,
  event: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const at = new Date().toISOString();
  const attemptEvent: AttemptEvent = {
    attemptId: attempt.attemptId,
    at,
    issueId: attempt.issueId,
    issueIdentifier: attempt.issueIdentifier,
    sessionId: attempt.threadId,
    event,
    message,
    metadata,
  };
  const checkpoint: Omit<AttemptCheckpointRecord, "checkpointId" | "ordinal"> = {
    attemptId: attempt.attemptId,
    trigger: "status_transition",
    eventCursor: null,
    status:
      metadata.status === "running" || metadata.status === "paused"
        ? (metadata.status as AttemptRecord["status"])
        : "failed",
    threadId: attempt.threadId,
    turnId: attempt.turnId,
    turnCount: attempt.turnCount,
    tokenUsage: attempt.tokenUsage,
    metadata,
    createdAt: at,
  };
  await attemptStore.appendEvent(attemptEvent);
  await attemptStore.appendCheckpoint(checkpoint);
}

async function probeContainers(
  ctx: RecoveryContext,
  attempt: AttemptRecord,
): Promise<{ containers: Array<{ name: string; running: boolean }>; error: string | null }> {
  const inspectContainers = ctx.inspectWorkspaceContainers ?? listContainersByWorkspace;
  if (!attempt.workspacePath) {
    return { containers: [], error: null };
  }
  try {
    return { containers: await inspectContainers(attempt.workspacePath), error: null };
  } catch (error) {
    return { containers: [], error: toErrorString(error) };
  }
}

function recordReportOutcome(report: RecoveryReport, attemptId: string, action: RecoveryAction): void {
  if (action === "resume") report.resumed.push(attemptId);
  if (action === "cleanup") report.cleanedUp.push(attemptId);
  if (action === "escalate") report.escalated.push(attemptId);
  if (action === "skip") report.skipped.push(attemptId);
}

async function cleanupContainers(
  ctx: RecoveryContext,
  containers: Array<{ name: string; running: boolean }>,
): Promise<void> {
  const cleanupContainer = ctx.removeContainer ?? removeContainer;
  for (const container of containers) {
    await cleanupContainer(container.name);
  }
}

async function handleResume(
  ctx: RecoveryContext,
  attempt: AttemptRecord,
  assessment: RecoveryAssessment,
  issue: Issue,
  containers: Array<{ name: string; running: boolean }>,
  report: RecoveryReport,
  _result: RecoveryResult,
): Promise<void> {
  await cleanupContainers(ctx, containers);
  await ctx.launchWorker(issue, attempt.attemptNumber, {
    recoveredAttempt: attempt,
    previousThreadId: attempt.threadId,
    modelSelectionOverride: recoveryModelSelection(attempt),
  });
  await appendRecoveryEvent(ctx.attemptStore, attempt, "attempt_recovery_resumed", "Recovered attempt resumed", {
    action: "resume",
    reason: assessment.reason,
    status: "running",
    containers: assessment.containerNames,
  });
  recordReportOutcome(report, attempt.attemptId, "resume");
}

async function handleCleanup(
  ctx: RecoveryContext,
  attempt: AttemptRecord,
  assessment: RecoveryAssessment,
  issue: Issue | undefined,
  containers: Array<{ name: string; running: boolean }>,
  report: RecoveryReport,
  result: RecoveryResult,
): Promise<void> {
  await cleanupContainers(ctx, containers);
  const cleanupResult = ctx.workspaceManager.removeWorkspaceWithResult
    ? await ctx.workspaceManager.removeWorkspaceWithResult(attempt.issueIdentifier, issue)
    : (await ctx.workspaceManager.removeWorkspace(attempt.issueIdentifier, issue), null);
  result.autoCommitSha = cleanupResult?.autoCommitSha ?? null;
  if (cleanupResult?.preserved) {
    await ctx.attemptStore.updateAttempt(attempt.attemptId, {
      status: "failed",
      endedAt: new Date().toISOString(),
      errorCode: "recovery_cleanup_preserved",
      errorMessage: cleanupResult.autoCommitError ?? assessment.reason,
    });
    await appendRecoveryEvent(
      ctx.attemptStore,
      attempt,
      "attempt_recovery_preserved",
      "Attempt recovery preserved the workspace for manual inspection",
      {
        action: "escalate",
        reason: cleanupResult.autoCommitError ?? assessment.reason,
        status: "failed",
        autoCommitSha: cleanupResult.autoCommitSha ?? null,
      },
    );
    result.success = false;
    result.workspacePreserved = true;
    result.error = cleanupResult.autoCommitError ?? "workspace preserved during recovery cleanup";
    recordReportOutcome(report, attempt.attemptId, "escalate");
    return;
  }
  await ctx.attemptStore.updateAttempt(attempt.attemptId, {
    status: "failed",
    endedAt: new Date().toISOString(),
    errorCode: "recovery_cleanup",
    errorMessage: assessment.reason,
  });
  await appendRecoveryEvent(ctx.attemptStore, attempt, "attempt_recovery_cleaned", "Recovered attempt cleaned up", {
    action: "cleanup",
    reason: assessment.reason,
    status: "failed",
    autoCommitSha: cleanupResult?.autoCommitSha ?? null,
  });
  recordReportOutcome(report, attempt.attemptId, "cleanup");
}

async function handleEscalation(
  ctx: RecoveryContext,
  attempt: AttemptRecord,
  assessment: RecoveryAssessment,
  report: RecoveryReport,
): Promise<void> {
  await ctx.attemptStore.updateAttempt(attempt.attemptId, {
    status: "paused",
    endedAt: new Date().toISOString(),
    errorCode: "recovery_escalated",
    errorMessage: assessment.reason,
  });
  await appendRecoveryEvent(
    ctx.attemptStore,
    attempt,
    "attempt_recovery_escalated",
    "Attempt recovery requires operator attention",
    {
      action: "escalate",
      reason: assessment.reason,
      status: "paused",
      containerNames: assessment.containerNames,
    },
  );
  recordReportOutcome(report, attempt.attemptId, "escalate");
}

async function executeAssessment(
  ctx: RecoveryContext,
  attempt: AttemptRecord,
  assessment: RecoveryAssessment,
  issue: Issue | undefined,
  containers: Array<{ name: string; running: boolean }>,
  report: RecoveryReport,
  result: RecoveryResult,
): Promise<void> {
  if (assessment.action === "resume" && issue) {
    await handleResume(ctx, attempt, assessment, issue, containers, report, result);
    return;
  }
  if (assessment.action === "cleanup") {
    await handleCleanup(ctx, attempt, assessment, issue, containers, report, result);
    return;
  }
  if (assessment.action === "escalate") {
    await handleEscalation(ctx, attempt, assessment, report);
    return;
  }
  recordReportOutcome(report, attempt.attemptId, "skip");
}

function emptyRecoveryReport(dryRun: boolean, startedAtMs: number): RecoveryReport {
  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    totalScanned: 0,
    resumed: [],
    cleanedUp: [],
    escalated: [],
    skipped: [],
    errors: [],
    results: [],
    durationMs: Date.now() - startedAtMs,
  };
}

function buildRecoveryReport(totalScanned: number, dryRun: boolean): RecoveryReport {
  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    totalScanned,
    resumed: [],
    cleanedUp: [],
    escalated: [],
    skipped: [],
    errors: [],
    results: [],
    durationMs: 0,
  };
}

function logProbeError(ctx: RecoveryContext, attempt: AttemptRecord, error: string | null): void {
  if (!error) {
    return;
  }
  ctx.logger.warn(
    { attemptId: attempt.attemptId, workspacePath: attempt.workspacePath, error },
    "recovery container probe failed; continuing with conservative defaults",
  );
}

async function processAttempt(
  ctx: RecoveryContext,
  attempt: AttemptRecord,
  issuesById: Map<string, Issue>,
  report: RecoveryReport,
  dryRun: boolean,
): Promise<void> {
  const { containers, error } = await probeContainers(ctx, attempt);
  logProbeError(ctx, attempt, error);
  const assessment = assessAttempt(attempt, issuesById.get(attempt.issueId) ?? null, ctx.getConfig(), {
    workspaceExists: await workspaceExists(attempt.workspacePath),
    workerAlive: containers.some((container) => container.running),
    containerNames: containers.map((container) => container.name),
  });
  const result: RecoveryResult = {
    ...assessment,
    success: true,
    autoCommitSha: null,
    workspacePreserved: false,
    error,
  };

  try {
    if (dryRun) {
      recordReportOutcome(report, attempt.attemptId, assessment.action);
    } else {
      await executeAssessment(ctx, attempt, assessment, issuesById.get(attempt.issueId), containers, report, result);
    }
  } catch (recoveryError) {
    const message = toErrorString(recoveryError);
    result.success = false;
    result.error = message;
    report.errors.push({
      attemptId: attempt.attemptId,
      issueIdentifier: attempt.issueIdentifier,
      error: message,
    });
  }

  report.results.push(result);
}

export async function runStartupRecovery(
  ctx: RecoveryContext,
  options?: { dryRun?: boolean },
): Promise<RecoveryReport> {
  const startedAtMs = Date.now();
  const dryRun = options?.dryRun ?? false;
  const runningAttempts = latestRunningAttempts(ctx.attemptStore.getAllAttempts());
  if (runningAttempts.length === 0) {
    return emptyRecoveryReport(dryRun, startedAtMs);
  }

  const issues = await ctx.tracker.fetchIssueStatesByIds([
    ...new Set(runningAttempts.map((attempt) => attempt.issueId)),
  ]);
  const issuesById = new Map(issues.map((issue) => [issue.id, issue]));
  const report = buildRecoveryReport(runningAttempts.length, dryRun);

  for (const attempt of runningAttempts) {
    await processAttempt(ctx, attempt, issuesById, report, dryRun);
  }

  report.durationMs = Date.now() - startedAtMs;
  ctx.logger.info(
    {
      totalScanned: report.totalScanned,
      resumed: report.resumed.length,
      cleanedUp: report.cleanedUp.length,
      escalated: report.escalated.length,
      errors: report.errors.length,
      durationMs: report.durationMs,
    },
    "startup recovery completed",
  );
  return report;
}
