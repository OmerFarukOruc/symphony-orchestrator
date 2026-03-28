/**
 * E2E lifecycle teardown phases: verify-pr, verify-linear, collect-artifacts, cleanup.
 * Also exports shutdownSymphony for graceful Symphony process termination.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { RunContext, PhaseResult } from "./types.js";
import { callLinearGraphQL, resolveEnvValue } from "./helpers.js";

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function extractPrNumber(prUrl: string): number | null {
  const match = /\/pull\/(\d+)/.exec(prUrl);
  return match ? Number(match[1]) : null;
}

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

function errorMsg(error_: unknown): string {
  return error_ instanceof Error ? error_.message : String(error_);
}

/* ------------------------------------------------------------------ */
/*  Phase 8 — verify-pr                                                */
/* ------------------------------------------------------------------ */

export async function verifyPr(ctx: RunContext): Promise<PhaseResult> {
  const start = performance.now();

  if (!ctx.prUrl) {
    return {
      phase: "verify-pr",
      status: "fail",
      durationMs: elapsed(start),
      error: "No PR URL found in attempt record",
    };
  }

  const prNumber = extractPrNumber(ctx.prUrl);
  if (!prNumber) {
    return {
      phase: "verify-pr",
      status: "fail",
      durationMs: elapsed(start),
      error: `Could not parse PR number from URL: ${ctx.prUrl}`,
    };
  }

  const { owner, repo } = ctx.config.github.test_repo;

  let raw: string;
  try {
    raw = execFileSync(
      "gh",
      [
        "pr",
        "view",
        String(prNumber),
        "--repo",
        `${owner}/${repo}`,
        "--json",
        "url,commits,additions,deletions,state,title",
      ],
      { timeout: 30_000, encoding: "utf-8" },
    );
  } catch (error_) {
    return {
      phase: "verify-pr",
      status: "fail",
      durationMs: elapsed(start),
      error: `gh pr view failed: ${errorMsg(error_)}`,
    };
  }

  const pr = JSON.parse(raw) as {
    state: string;
    commits: { totalCount?: number } | number;
    additions: number;
    deletions: number;
  };

  const commitCount = typeof pr.commits === "number" ? pr.commits : (pr.commits.totalCount ?? 0);
  const state = pr.state.toUpperCase();

  const errors: string[] = [];
  if (state !== "OPEN" && state !== "MERGED") {
    errors.push(`unexpected PR state: ${state}`);
  }
  if (commitCount < 1) {
    errors.push(`expected >= 1 commit, got ${String(commitCount)}`);
  }
  if (pr.additions + pr.deletions === 0) {
    errors.push("PR has zero additions + deletions");
  }

  if (errors.length > 0) {
    return {
      phase: "verify-pr",
      status: "fail",
      durationMs: elapsed(start),
      error: errors.join("; "),
    };
  }

  return {
    phase: "verify-pr",
    status: "pass",
    durationMs: elapsed(start),
    data: {
      prNumber,
      commits: commitCount,
      additions: pr.additions,
      deletions: pr.deletions,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Phase 9 — verify-linear                                            */
/* ------------------------------------------------------------------ */

export async function verifyLinear(ctx: RunContext): Promise<PhaseResult> {
  const start = performance.now();

  if (!ctx.issueId) {
    return {
      phase: "verify-linear",
      status: "fail",
      durationMs: elapsed(start),
      error: "No issue ID available in context",
    };
  }

  const apiKey = resolveEnvValue(ctx.config.linear.api_key);
  if (!apiKey) {
    return {
      phase: "verify-linear",
      status: "fail",
      durationMs: elapsed(start),
      error: "LINEAR_API_KEY could not be resolved",
    };
  }

  const query = `
    query {
      issue(id: "${ctx.issueId}") {
        state { name }
        comments(first: 10) { nodes { body createdAt } }
      }
    }
  `;

  let payload: { data?: Record<string, unknown> };
  try {
    payload = await callLinearGraphQL(apiKey, query, {});
  } catch (error_) {
    return {
      phase: "verify-linear",
      status: "fail",
      durationMs: elapsed(start),
      error: `Linear GraphQL failed: ${errorMsg(error_)}`,
    };
  }

  const issue = payload.data?.issue as
    | {
        state?: { name?: string };
        comments?: { nodes?: Array<{ body?: string; createdAt?: string }> };
      }
    | undefined;

  if (!issue) {
    return {
      phase: "verify-linear",
      status: "fail",
      durationMs: elapsed(start),
      error: "Issue not found in Linear response",
    };
  }

  const stateName = issue.state?.name ?? "(unknown)";
  const comments = issue.comments?.nodes ?? [];
  const commentCount = comments.length;

  const errors: string[] = [];
  if (stateName !== "Done") {
    errors.push(`expected state "Done", got "${stateName}"`);
  }

  const hasRelevantComment = comments.some((comment) => {
    const body = (comment.body ?? "").toLowerCase();
    return body.includes("token") || body.includes("attempt") || body.includes("pr");
  });
  if (!hasRelevantComment) {
    errors.push("no comment mentioning tokens, attempt, or PR");
  }

  if (errors.length > 0) {
    return {
      phase: "verify-linear",
      status: "fail",
      durationMs: elapsed(start),
      error: errors.join("; "),
    };
  }

  return {
    phase: "verify-linear",
    status: "pass",
    durationMs: elapsed(start),
    data: { finalState: "Done", commentCount },
  };
}

/* ------------------------------------------------------------------ */
/*  Phase 10 — collect-artifacts (ALWAYS runs)                         */
/* ------------------------------------------------------------------ */

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function collectArtifacts(ctx: RunContext): Promise<PhaseResult> {
  const start = performance.now();

  const artifactsDir = join(ctx.reportDir, "artifacts");

  try {
    await mkdir(artifactsDir, { recursive: true });

    const symphonyDir = join(ctx.workspaceDir ?? ".", ".symphony");

    const attemptsDir = join(symphonyDir, "attempts");
    if (await pathExists(attemptsDir)) {
      await cp(attemptsDir, join(artifactsDir, "attempts"), { recursive: true });
    }

    const eventsDir = join(symphonyDir, "events");
    if (await pathExists(eventsDir)) {
      await cp(eventsDir, join(artifactsDir, "events"), { recursive: true });
    }

    const dbPath = join(symphonyDir, "symphony.db");
    if (await pathExists(dbPath)) {
      await cp(dbPath, join(artifactsDir, "symphony.db"));
    }
  } catch (error_) {
    return {
      phase: "collect-artifacts",
      status: "fail",
      durationMs: elapsed(start),
      error: `Artifact collection failed: ${errorMsg(error_)}`,
    };
  }

  return {
    phase: "collect-artifacts",
    status: "pass",
    durationMs: elapsed(start),
  };
}

/* ------------------------------------------------------------------ */
/*  Phase 11 — cleanup (ALWAYS runs)                                   */
/* ------------------------------------------------------------------ */

export async function cleanup(ctx: RunContext): Promise<PhaseResult> {
  const start = performance.now();

  if (ctx.config.cleanup.enabled === false || ctx.flags?.keep) {
    return {
      phase: "cleanup",
      status: "pass",
      durationMs: elapsed(start),
      data: { skipped: true },
    };
  }

  const results = { prClosed: false, issueCanceled: false };
  const { owner, repo } = ctx.config.github.test_repo;

  // Close PR — only if we have a PR URL
  if (ctx.prUrl) {
    const prNumber = extractPrNumber(ctx.prUrl);
    if (prNumber) {
      try {
        execFileSync("gh", ["pr", "close", String(prNumber), "--repo", `${owner}/${repo}`, "--delete-branch"], {
          timeout: 15_000,
        });
        results.prClosed = true;
      } catch (error_) {
        console.warn(`[cleanup] failed to close PR #${String(prNumber)}: ${errorMsg(error_)}`);
      }
    }
  }

  // Cancel issue — only if we have an issue ID
  if (ctx.issueId) {
    const apiKey = resolveEnvValue(ctx.config.linear.api_key);
    if (apiKey) {
      try {
        const teamId = ctx.config.linear.team_id;

        // Step 1: Find "Canceled" state ID
        const statesQuery = `
          query {
            team(id: "${teamId}") {
              states { nodes { id name } }
            }
          }
        `;
        const statesPayload = await callLinearGraphQL(apiKey, statesQuery, {});
        const stateNodes =
          (statesPayload.data?.team as { states?: { nodes?: Array<{ id: string; name: string }> } })?.states?.nodes ??
          [];
        const canceledState = stateNodes.find((node) => node.name === "Canceled");

        // Step 2: Transition issue
        if (canceledState) {
          const mutation = `
            mutation {
              issueUpdate(id: "${ctx.issueId}", input: { stateId: "${canceledState.id}" }) {
                success
              }
            }
          `;
          await callLinearGraphQL(apiKey, mutation, {});
          results.issueCanceled = true;
        }
      } catch (error_) {
        console.warn(`[cleanup] failed to cancel issue ${ctx.issueId}: ${errorMsg(error_)}`);
      }
    }
  }

  return {
    phase: "cleanup",
    status: "pass",
    durationMs: elapsed(start),
    data: results,
  };
}

/* ------------------------------------------------------------------ */
/*  shutdownSymphony — graceful SIGTERM → SIGKILL escalation           */
/* ------------------------------------------------------------------ */

export async function shutdownSymphony(ctx: RunContext): Promise<void> {
  const proc = ctx.symphonyProcess;
  if (!proc || proc.exitCode !== null) {
    return;
  }

  const gracefulMs = ctx.config.timeouts.graceful_shutdown_ms ?? 10_000;

  proc.kill("SIGTERM");

  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      proc.once("exit", () => resolve(true));
    }),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), gracefulMs);
    }),
  ]);

  if (!exited && proc.exitCode === null) {
    console.warn("[shutdown] Symphony did not exit gracefully, sending SIGKILL");
    proc.kill("SIGKILL");
  }
}
