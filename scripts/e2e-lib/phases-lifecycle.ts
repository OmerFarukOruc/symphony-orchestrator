/**
 * Lifecycle phases (4 – 7.5) for the Symphony E2E test.
 *
 * Phases:
 *   4   createIssue        — create a test issue via Linear GraphQL
 *   5   waitPickup         — poll /api/v1/state until Symphony claims the issue
 *   6   monitorLifecycle   — poll state + attempts until completion or timeout
 *   7.5 restartResilience  — restart Symphony and verify the issue is NOT re-dispatched
 */

import type { ChildProcess } from "node:child_process";

import type { RunContext, PhaseResult } from "./types.js";
import { callLinearGraphQL, resolveEnvValue, sleep, waitForHttp, spawnSymphony, fetchJson } from "./helpers.js";

// ---------------------------------------------------------------------------
// Inline types for API responses (avoids importing from src/)
// ---------------------------------------------------------------------------

/** Subset of RuntimeIssueView as returned inside /api/v1/state arrays. */
interface StateIssueEntry {
  identifier: string;
  issueId: string;
  title: string;
  status: string;
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

const CREATE_ISSUE_MUTATION = `
mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $priority: Int) {
  issueCreate(input: {
    teamId: $teamId
    title: $title
    description: $description
    priority: $priority
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

/**
 * Gracefully stop a Symphony child process: SIGTERM, then SIGKILL after a timeout.
 * Returns once the process has exited.
 */
async function stopProcess(child: ChildProcess, gracefulMs: number): Promise<void> {
  if (child.exitCode !== null) {
    return; // Already exited
  }

  child.kill("SIGTERM");

  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      child.once("exit", () => resolve(true));
    }),
    sleep(gracefulMs).then(() => false),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    });
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

  log(ctx, `Creating issue: "${title}"`);

  const result = (await callLinearGraphQL(apiKey, CREATE_ISSUE_MUTATION, {
    teamId: config.linear.team_id,
    title,
    description,
    priority: config.test_issue.priority,
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
    const found = state.running.some((entry) => entry.identifier === ctx.issueIdentifier);

    log(ctx, `Poll: running=${runningCount}, found=${String(found)}`);

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
// Phase 6: Monitor Lifecycle
// ---------------------------------------------------------------------------

export async function monitorLifecycle(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const timeoutMs = ctx.config.timeouts.lifecycle_complete_ms;
  const deadline = start + timeoutMs;

  const stateIntervalMs = 5000;
  const attemptIntervalMs = 30_000;

  log(ctx, `Monitoring lifecycle for ${ctx.issueIdentifier} (timeout: ${timeoutMs}ms)`);

  let lastAttempt: AttemptSummaryEntry | null = null;
  let completed = false;
  let failReason: string | null = null;

  // Track last poll timestamps so both loops run on independent cadences.
  let lastStatePoll = 0;
  let lastAttemptPoll = 0;

  while (Date.now() < deadline) {
    const now = Date.now();

    // --- State polling (every 5s) ---
    if (now - lastStatePoll >= stateIntervalMs) {
      lastStatePoll = now;
      try {
        const state = (await fetchJson(`${ctx.baseUrl}/api/v1/state`)) as StateResponse;
        const inRunning = state.running.some((entry) => entry.identifier === ctx.issueIdentifier);

        log(ctx, `State poll: running=${state.running.length}, ours_in_running=${String(inRunning)}`);

        // If the issue disappeared from running, check attempts for terminal state.
        if (!inRunning && lastAttempt === null) {
          // Force an immediate attempt poll to pick up completion.
          lastAttemptPoll = 0;
        }
      } catch (error_) {
        const message = error_ instanceof Error ? error_.message : String(error_);
        log(ctx, `State poll error: ${message}`);
      }
    }

    // --- Attempt polling (every 30s or forced) ---
    if (now - lastAttemptPoll >= attemptIntervalMs) {
      lastAttemptPoll = now;
      try {
        const attemptsResp = (await fetchJson(
          `${ctx.baseUrl}/api/v1/${ctx.issueIdentifier}/attempts`,
        )) as AttemptsResponse;

        const attempts = attemptsResp.attempts;
        if (attempts.length > 0) {
          lastAttempt = attempts.at(-1) ?? null;
        }

        if (lastAttempt) {
          log(
            ctx,
            `Attempt poll: #${String(lastAttempt.attemptNumber)} status=${lastAttempt.status} model=${lastAttempt.model}`,
          );

          if (TERMINAL_ATTEMPT_STATUSES.has(lastAttempt.status)) {
            if (lastAttempt.status === "completed") {
              completed = true;
            } else {
              failReason = `Attempt ended with status: ${lastAttempt.status}`;
              if (lastAttempt.errorCode) {
                failReason += ` (${lastAttempt.errorCode})`;
              }
            }
            break;
          }
        }
      } catch (error_) {
        const message = error_ instanceof Error ? error_.message : String(error_);
        log(ctx, `Attempt poll error: ${message}`);
      }
    }

    // Sleep a short tick to avoid busy-looping.
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(1000, remaining));
  }

  // --- Timeout ---
  if (!completed && failReason === null) {
    failReason = `Lifecycle timed out after ${timeoutMs}ms`;
  }

  // --- Gather final attempt data ---
  let attemptData: Record<string, unknown> = {};
  if (lastAttempt) {
    const durationMs =
      lastAttempt.endedAt && lastAttempt.startedAt
        ? new Date(lastAttempt.endedAt).getTime() - new Date(lastAttempt.startedAt).getTime()
        : null;

    attemptData = {
      number: lastAttempt.attemptNumber,
      model: lastAttempt.model,
      turns: lastAttempt.turnCount ?? null,
      tokens: lastAttempt.tokenUsage,
      durationMs,
      status: lastAttempt.status,
      errorCode: lastAttempt.errorCode,
      errorMessage: lastAttempt.errorMessage,
    };
  }

  // --- Pull PR URL from the issue detail endpoint ---
  try {
    const detail = (await fetchJson(`${ctx.baseUrl}/api/v1/${ctx.issueIdentifier}`)) as IssueDetailResponse;
    if (detail.pullRequestUrl) {
      ctx.prUrl = detail.pullRequestUrl;
      attemptData.pullRequestUrl = detail.pullRequestUrl;
    }
  } catch {
    log(ctx, "Could not fetch issue detail for PR URL");
  }

  if (completed) {
    log(ctx, `Lifecycle completed successfully`);
    return {
      phase: "monitor-lifecycle",
      status: "pass",
      durationMs: Date.now() - start,
      data: {
        turns: attemptData.turns ?? null,
        tokens: attemptData.tokens ?? null,
        status: attemptData.status ?? null,
        attemptData,
      },
    };
  }

  log(ctx, `Lifecycle failed: ${failReason}`);
  return {
    phase: "monitor-lifecycle",
    status: "fail",
    durationMs: Date.now() - start,
    error: { message: failReason ?? "unknown failure" },
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

  // 2. Restart Symphony with the same port.
  // Derive the workflow path from the report directory sibling.
  const workflowPath = "WORKFLOW.e2e.md";
  log(ctx, `Restarting Symphony on port ${ctx.symphonyPort}`);
  ctx.symphonyProcess = spawnSymphony(ctx.symphonyPort, workflowPath, ctx.reportDir);

  // 3. Wait for HTTP ready.
  try {
    await waitForHttp(`${ctx.baseUrl}/api/v1/state`, startupMs);
  } catch (error_) {
    const message = error_ instanceof Error ? error_.message : String(error_);
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
  let redispatched = false;
  try {
    const state = (await fetchJson(`${ctx.baseUrl}/api/v1/state`)) as StateResponse;
    redispatched = state.running.some((entry) => entry.identifier === ctx.issueIdentifier);
    log(ctx, `Post-restart state: running=${state.running.length}, our_issue_in_running=${String(redispatched)}`);
  } catch (error_) {
    const message = error_ instanceof Error ? error_.message : String(error_);
    return {
      phase: "restart-resilience",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: `Failed to fetch state after restart: ${message}` },
    };
  }

  // 6. Shut down the restarted process.
  if (ctx.symphonyProcess) {
    log(ctx, "Shutting down restarted Symphony");
    await stopProcess(ctx.symphonyProcess, gracefulMs);
    ctx.symphonyProcess = null;
  }

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
