/**
 * Lifecycle phases (4 – 7.5) for the Symphony E2E test.
 *
 * Phases:
 *   4   createIssue        — create a test issue via Linear GraphQL
 *   5   waitPickup         — poll /api/v1/state until Symphony claims the issue
 *   6   monitorLifecycle   — poll state + attempts until completion or timeout
 *   7.5 restartResilience  — restart Symphony and verify the issue is NOT re-dispatched
 */

import type { RunContext, PhaseResult } from "./types.js";
import {
  buildSymphonyEnv,
  callLinearGraphQL,
  errorMsg,
  resolveEnvValue,
  sleep,
  waitForHttp,
  spawnSymphony,
  fetchJson,
  stopProcess,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Inline types for API responses (avoids importing from src/)
// ---------------------------------------------------------------------------

/** Subset of RuntimeIssueView as returned inside /api/v1/state arrays. */
interface StateIssueEntry {
  identifier: string;
  issueId: string;
  title: string;
  status: string;
  attempt?: number | null;
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  lastEventAt?: string | null;
  message?: string | null;
  pullRequestUrl?: string | null;
}

/** Top-level shape of GET /api/v1/state (snake_case keys). */
interface StateResponse {
  generated_at: string;
  counts: { running: number; retrying: number };
  running: StateIssueEntry[];
  retrying: StateIssueEntry[];
  completed: StateIssueEntry[];
  queued: StateIssueEntry[];
}

/** AttemptSummary as returned by GET /api/v1/{identifier}/attempts. */
interface AttemptSummaryEntry {
  attemptId: string;
  attemptNumber: number | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  model: string;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  errorCode: string | null;
  errorMessage: string | null;
  turnCount?: number;
}

/** Shape of the /api/v1/{identifier}/attempts response. */
interface AttemptsResponse {
  attempts: AttemptSummaryEntry[];
  current_attempt_id: string | null;
}

/** Shape of the /api/v1/{identifier} detail response (has pullRequestUrl). */
interface IssueDetailResponse {
  pullRequestUrl?: string | null;
  attempts: AttemptSummaryEntry[];
  currentAttemptId: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMINAL_ATTEMPT_STATUSES = new Set(["completed", "failed", "timed_out", "stalled", "cancelled"]);

/** Seconds elapsed since an ISO timestamp. */
function secondsElapsed(isoDate: string): number {
  return Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
}

const TEAM_STATES_QUERY = `
query TeamStates($teamId: String!) {
  team(id: $teamId) {
    states { nodes { id name type } }
  }
}
`;

const PROJECT_LOOKUP_QUERY = `
query ProjectLookup($slugId: String!) {
  projects(filter: { slugId: { eq: $slugId } }) {
    nodes { id name slugId }
  }
}
`;

const CREATE_ISSUE_MUTATION = `
mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $priority: Int, $stateId: String, $projectId: String) {
  issueCreate(input: {
    teamId: $teamId
    title: $title
    description: $description
    priority: $priority
    stateId: $stateId
    projectId: $projectId
  }) {
    success
    issue { id identifier url state { name } }
  }
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(ctx: RunContext, message: string): void {
  const line = `[e2e] ${message}`;
  if (ctx.verbose) {
    console.log(line);
  }
  ctx.events.write({ at: new Date().toISOString(), event: "log", message });
}

// ---------------------------------------------------------------------------
// Phase 4 helpers
// ---------------------------------------------------------------------------

/** Resolve the "In Progress" state ID for the team so issues land in an active state. */
async function resolveInProgressStateId(apiKey: string, teamId: string, ctx: RunContext): Promise<string | null> {
  try {
    const statesResult = (await callLinearGraphQL(apiKey, TEAM_STATES_QUERY, { teamId })) as {
      data?: { team?: { states?: { nodes?: Array<{ id: string; name: string; type: string }> } } };
    };
    const states = statesResult.data?.team?.states?.nodes ?? [];
    const inProgress = states.find((s) => s.name === "In Progress") ?? states.find((s) => s.type === "started");
    const stateId = inProgress?.id ?? null;
    log(ctx, `Resolved "In Progress" state: ${stateId ?? "not found, using default"}`);
    return stateId;
  } catch {
    log(ctx, "Could not resolve team states — issue will use default state");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 4: Create Issue
// ---------------------------------------------------------------------------

export async function createIssue(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();

  const apiKey = resolveEnvValue(ctx.config.linear.api_key);
  const { config, runId } = ctx;

  const title = `${config.test_issue.title} -- ${runId}`;
  const description = config.test_issue.description.replaceAll("{run_id}", runId);
  const stateId = await resolveInProgressStateId(apiKey, config.linear.team_id, ctx);

  // Resolve the Linear project ID from the slug so the issue is assigned to the
  // correct project. Without this, fetchCandidateIssues (which filters by project
  // slug) would never see the issue.
  let projectId: string | null = null;
  try {
    const projectResult = (await callLinearGraphQL(apiKey, PROJECT_LOOKUP_QUERY, {
      slugId: config.linear.project_slug,
    })) as { data?: { projects?: { nodes?: Array<{ id: string; name: string }> } } };
    projectId = projectResult.data?.projects?.nodes?.at(0)?.id ?? null;
    log(ctx, `Resolved project "${config.linear.project_slug}" → ${projectId ?? "not found"}`);
  } catch {
    log(ctx, "Could not resolve project ID — issue may not be visible to orchestrator");
  }

  log(ctx, `Creating issue: "${title}"`);

  const result = (await callLinearGraphQL(apiKey, CREATE_ISSUE_MUTATION, {
    teamId: config.linear.team_id,
    title,
    description,
    priority: config.test_issue.priority,
    stateId,
    projectId,
  })) as {
    data?: {
      issueCreate?: {
        success: boolean;
        issue?: { id: string; identifier: string; url: string; state?: { name: string } };
      };
    };
  };

  const issueCreate = result.data?.issueCreate;
  if (!issueCreate?.success || !issueCreate.issue) {
    return {
      phase: "create-issue",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: "issueCreate mutation returned success=false or missing issue" },
    };
  }

  const issue = issueCreate.issue;
  ctx.issueIdentifier = issue.identifier;
  ctx.issueId = issue.id;
  ctx.issueUrl = issue.url;

  log(ctx, `Issue created: ${issue.identifier} (state: ${issue.state?.name ?? "unknown"})`);

  return {
    phase: "create-issue",
    status: "pass",
    durationMs: Date.now() - start,
    data: { identifier: ctx.issueIdentifier },
  };
}

// ---------------------------------------------------------------------------
// Phase 5: Wait Pickup
// ---------------------------------------------------------------------------

export async function waitPickup(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const timeoutMs = ctx.config.timeouts.issue_pickup_ms;
  const deadline = start + timeoutMs;
  const pollIntervalMs = 3000;

  log(ctx, `Waiting for ${ctx.issueIdentifier} to appear in running[] (timeout: ${timeoutMs}ms)`);

  while (Date.now() < deadline) {
    const state = (await fetchJson(`${ctx.baseUrl}/api/v1/state`)) as StateResponse;
    const runningCount = state.running.length;
    const queuedCount = state.queued.length;
    const found = state.running.some((entry) => entry.identifier === ctx.issueIdentifier);
    const inQueue = state.queued.some((entry) => entry.identifier === ctx.issueIdentifier);

    log(ctx, `Poll: running=${runningCount} queued=${queuedCount} found=${String(found)} inQueue=${String(inQueue)}`);

    if (found) {
      return {
        phase: "wait-pickup",
        status: "pass",
        durationMs: Date.now() - start,
        data: { note: "claimed" },
      };
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(pollIntervalMs, remaining));
  }

  return {
    phase: "wait-pickup",
    status: "fail",
    durationMs: Date.now() - start,
    error: {
      message: `Issue ${ctx.issueIdentifier} did not appear in running[] within ${timeoutMs}ms`,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 6: Monitor Lifecycle — helpers
// ---------------------------------------------------------------------------

interface MonitorState {
  lastAttempt: AttemptSummaryEntry | null;
  completed: boolean;
  failReason: string | null;
  lastStatePoll: number;
  lastAttemptPoll: number;
}

/** Poll /api/v1/state, returns whether to force an immediate attempt poll. */
async function pollState(ctx: RunContext, monitor: MonitorState): Promise<void> {
  try {
    const state = (await fetchJson(`${ctx.baseUrl}/api/v1/state`)) as StateResponse;
    const ours = state.running.find((entry) => entry.identifier === ctx.issueIdentifier);
    const inRunning = ours !== undefined;

    let detail = "";
    if (ours) {
      const parts: string[] = [];
      if (ours.attempt != null) parts.push(`attempt=#${String(ours.attempt)}`);
      if (ours.tokenUsage) parts.push(`tokens=${String(ours.tokenUsage.totalTokens)}`);
      if (ours.lastEventAt) {
        parts.push(`last_event=${String(secondsElapsed(ours.lastEventAt))}s ago`);
      }
      if (parts.length > 0) detail = ` (${parts.join(", ")})`;
    }

    log(ctx, `State: running=${state.running.length} ours=${String(inRunning)}${detail}`);

    if (!inRunning && monitor.lastAttempt === null) {
      monitor.lastAttemptPoll = 0;
    }
  } catch (error_) {
    log(ctx, `State poll error: ${errorMsg(error_)}`);
  }
}

/** Poll /api/v1/{identifier}/attempts, detect terminal status. */
async function pollAttempts(ctx: RunContext, monitor: MonitorState): Promise<void> {
  try {
    const attemptsResp = (await fetchJson(`${ctx.baseUrl}/api/v1/${ctx.issueIdentifier}/attempts`)) as AttemptsResponse;

    if (attemptsResp.attempts.length > 0) {
      monitor.lastAttempt = attemptsResp.attempts.at(0) ?? null;
    }

    if (!monitor.lastAttempt) return;

    const parts = [
      `#${String(monitor.lastAttempt.attemptNumber)}`,
      `status=${monitor.lastAttempt.status}`,
      `model=${monitor.lastAttempt.model}`,
    ];
    if (monitor.lastAttempt.turnCount != null) {
      parts.push(`turns=${String(monitor.lastAttempt.turnCount)}`);
    }
    if (monitor.lastAttempt.tokenUsage) {
      const tok = monitor.lastAttempt.tokenUsage;
      parts.push(`in=${String(tok.inputTokens)} out=${String(tok.outputTokens)}`);
    }
    if (monitor.lastAttempt.startedAt) {
      parts.push(`elapsed=${String(secondsElapsed(monitor.lastAttempt.startedAt))}s`);
    }
    log(ctx, `Attempt: ${parts.join(" ")}`);

    if (TERMINAL_ATTEMPT_STATUSES.has(monitor.lastAttempt.status)) {
      if (monitor.lastAttempt.status === "completed") {
        monitor.completed = true;
      } else {
        const suffix = monitor.lastAttempt.errorCode ? ` (${monitor.lastAttempt.errorCode})` : "";
        monitor.failReason = `Attempt ended with status: ${monitor.lastAttempt.status}${suffix}`;
      }
    }
  } catch (error_) {
    log(ctx, `Attempt poll error: ${errorMsg(error_)}`);
  }
}

function buildAttemptData(attempt: AttemptSummaryEntry): Record<string, unknown> {
  const durationMs =
    attempt.endedAt && attempt.startedAt
      ? new Date(attempt.endedAt).getTime() - new Date(attempt.startedAt).getTime()
      : null;

  return {
    number: attempt.attemptNumber,
    model: attempt.model,
    turns: attempt.turnCount ?? null,
    tokens: attempt.tokenUsage,
    durationMs,
    status: attempt.status,
    errorCode: attempt.errorCode,
    errorMessage: attempt.errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Phase 6: Monitor Lifecycle
// ---------------------------------------------------------------------------

async function runPollingLoop(
  ctx: RunContext,
  monitor: MonitorState,
  deadline: number,
  stateIntervalMs: number,
  attemptIntervalMs: number,
): Promise<void> {
  while (Date.now() < deadline) {
    const now = Date.now();

    if (now - monitor.lastStatePoll >= stateIntervalMs) {
      monitor.lastStatePoll = now;
      await pollState(ctx, monitor);
    }

    if (now - monitor.lastAttemptPoll >= attemptIntervalMs) {
      monitor.lastAttemptPoll = now;
      await pollAttempts(ctx, monitor);
      if (monitor.completed || monitor.failReason) return;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await sleep(Math.min(1000, remaining));
  }
}

async function enrichWithPrUrl(ctx: RunContext, attemptData: Record<string, unknown>): Promise<void> {
  try {
    const detail = (await fetchJson(`${ctx.baseUrl}/api/v1/${ctx.issueIdentifier}`)) as IssueDetailResponse;
    if (detail.pullRequestUrl) {
      ctx.prUrl = detail.pullRequestUrl;
      attemptData.pullRequestUrl = detail.pullRequestUrl;
    }
  } catch {
    log(ctx, "Could not fetch issue detail for PR URL");
  }
}

export async function monitorLifecycle(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const timeoutMs = ctx.config.timeouts.lifecycle_complete_ms;

  log(ctx, `Monitoring lifecycle for ${ctx.issueIdentifier} (timeout: ${timeoutMs}ms)`);

  const monitor: MonitorState = {
    lastAttempt: null,
    completed: false,
    failReason: null,
    lastStatePoll: 0,
    lastAttemptPoll: 0,
  };

  await runPollingLoop(ctx, monitor, start + timeoutMs, 5000, 30_000);

  if (!monitor.completed && monitor.failReason === null) {
    monitor.failReason = `Lifecycle timed out after ${timeoutMs}ms`;
  }

  const attemptData = monitor.lastAttempt ? buildAttemptData(monitor.lastAttempt) : {};
  await enrichWithPrUrl(ctx, attemptData);

  if (monitor.completed) {
    log(ctx, "Lifecycle completed successfully");
    return {
      phase: "monitor-lifecycle",
      status: "pass",
      durationMs: Date.now() - start,
      data: { turns: attemptData.turns ?? null, tokens: attemptData.tokens ?? null, attemptData },
    };
  }

  log(ctx, `Lifecycle failed: ${monitor.failReason}`);
  return {
    phase: "monitor-lifecycle",
    status: "fail",
    durationMs: Date.now() - start,
    error: { message: monitor.failReason ?? "unknown failure" },
    data: { attemptData },
  };
}

// ---------------------------------------------------------------------------
// Phase 7.5: Restart Resilience
// ---------------------------------------------------------------------------

export async function restartResilience(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const gracefulMs = ctx.config.timeouts.graceful_shutdown_ms;
  const startupMs = ctx.config.timeouts.symphony_startup_ms;

  log(ctx, "Phase 7.5: restart-resilience — verifying seedCompletedClaims dedup");

  // 1. Stop the running Symphony process.
  if (ctx.symphonyProcess) {
    log(ctx, "Sending SIGTERM to Symphony");
    await stopProcess(ctx.symphonyProcess, gracefulMs);
    log(ctx, "Symphony stopped");
  }

  // 2. Restart Symphony pointing at the same dataDir. The overlay and DB state
  //    persist on disk — no re-seeding needed. Symphony reads from the same
  //    <dataDir>/config/overlay.yaml and SQLite DB naturally on restart.
  const dataDir = `${ctx.reportDir}/symphony-data`;
  log(ctx, `Restarting Symphony on port ${ctx.symphonyPort}`);
  ctx.symphonyProcess = spawnSymphony(ctx.symphonyPort, dataDir, ctx.reportDir, buildSymphonyEnv(ctx));

  // 3. Wait for HTTP ready.
  try {
    await waitForHttp(`${ctx.baseUrl}/api/v1/state`, startupMs);
  } catch (error_) {
    const message = errorMsg(error_);
    return {
      phase: "restart-resilience",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: `Symphony failed to restart: ${message}` },
    };
  }
  log(ctx, "Restarted Symphony is HTTP-ready");

  // 4. Wait for the first orchestrator poll cycle to complete.
  const pollSettleMs = 10_000;
  log(ctx, `Waiting ${pollSettleMs}ms for first poll cycle`);
  await sleep(pollSettleMs);

  // 5. Check that the completed issue is NOT re-dispatched.
  const postRestartState = await fetchJson(`${ctx.baseUrl}/api/v1/state`).catch((caught: unknown) => {
    log(ctx, `Failed to fetch state after restart: ${errorMsg(caught)}`);
    return null;
  });

  // 6. Shut down the restarted process (unless --keep-symphony).
  if (ctx.symphonyProcess && !ctx.keepSymphony) {
    log(ctx, "Shutting down restarted Symphony");
    await stopProcess(ctx.symphonyProcess, gracefulMs);
    ctx.symphonyProcess = null;
  }

  if (postRestartState === null) {
    return {
      phase: "restart-resilience",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: "Failed to fetch state after restart" },
    };
  }

  const state = postRestartState as StateResponse;
  const redispatched = state.running.some((entry) => entry.identifier === ctx.issueIdentifier);
  log(ctx, `Post-restart state: running=${state.running.length}, our_issue_in_running=${String(redispatched)}`);

  if (redispatched) {
    return {
      phase: "restart-resilience",
      status: "fail",
      durationMs: Date.now() - start,
      error: {
        message: `Completed issue ${ctx.issueIdentifier} was re-dispatched after restart — seedCompletedClaims dedup is broken`,
      },
    };
  }

  log(ctx, "Restart resilience passed — completed issue not re-dispatched");
  return {
    phase: "restart-resilience",
    status: "pass",
    durationMs: Date.now() - start,
    data: { note: "completed issue not re-dispatched" },
  };
}
