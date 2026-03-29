/**
 * E2E lifecycle teardown phases: verify-pr, verify-linear, collect-artifacts, cleanup.
 * Also exports shutdownSymphony for graceful Symphony process termination.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { RunContext, PhaseResult } from "./types.js";
import { callLinearGraphQL, errorMsg, resolveEnvValue, stopProcess } from "./helpers.js";

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function extractPrNumber(prUrl: string): number | null {
  const match = /\/pull\/(\d+)/.exec(prUrl);
  return match ? Number(match[1]) : null;
}

/**
 * Copy a source path to a destination, silently skipping if source does not
 * exist (avoids the TOCTOU of checking existence then copying).
 */
async function tryCopy(src: string, dst: string, recursive = false): Promise<void> {
  try {
    await cp(src, dst, { recursive });
  } catch (error_: unknown) {
    if ((error_ as NodeJS.ErrnoException).code !== "ENOENT") throw error_;
  }
}

/* ------------------------------------------------------------------ */
/*  Phase 8 — verify-pr                                                */
/* ------------------------------------------------------------------ */

export async function verifyPr(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();

  if (!ctx.prUrl) {
    return {
      phase: "verify-pr",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: "No PR URL found in attempt record" },
    };
  }

  const prNumber = extractPrNumber(ctx.prUrl);
  if (!prNumber) {
    return {
      phase: "verify-pr",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: `Could not parse PR number from URL: ${ctx.prUrl}` },
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
      durationMs: Date.now() - start,
      error: { message: `gh pr view failed: ${errorMsg(error_)}` },
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
      durationMs: Date.now() - start,
      error: { message: errors.join("; ") },
    };
  }

  return {
    phase: "verify-pr",
    status: "pass",
    durationMs: Date.now() - start,
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
  const start = Date.now();

  if (!ctx.issueId) {
    return {
      phase: "verify-linear",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: "No issue ID available in context" },
    };
  }

  const apiKey = resolveEnvValue(ctx.config.linear.api_key);

  // Parameterized query — avoids GraphQL injection via ctx.issueId
  const query = `
    query VerifyIssue($issueId: String!) {
      issue(id: $issueId) {
        state { name }
        comments(first: 10) { nodes { body createdAt } }
      }
    }
  `;

  let payload: { data?: Record<string, unknown> };
  try {
    payload = (await callLinearGraphQL(apiKey, query, { issueId: ctx.issueId })) as {
      data?: Record<string, unknown>;
    };
  } catch (error_) {
    return {
      phase: "verify-linear",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: `Linear GraphQL failed: ${errorMsg(error_)}` },
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
      durationMs: Date.now() - start,
      error: { message: "Issue not found in Linear response" },
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
      durationMs: Date.now() - start,
      error: { message: errors.join("; ") },
    };
  }

  return {
    phase: "verify-linear",
    status: "pass",
    durationMs: Date.now() - start,
    data: { finalState: "Done", commentCount },
  };
}

/* ------------------------------------------------------------------ */
/*  Phase 10 — collect-artifacts (ALWAYS runs)                         */
/* ------------------------------------------------------------------ */

export async function collectArtifacts(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const artifactsDir = join(ctx.reportDir, "artifacts");

  try {
    await mkdir(artifactsDir, { recursive: true });

    const symphonyDir = join(".", ".symphony");

    await tryCopy(join(symphonyDir, "attempts"), join(artifactsDir, "attempts"), true);
    await tryCopy(join(symphonyDir, "events"), join(artifactsDir, "events"), true);
    await tryCopy(join(symphonyDir, "symphony.db"), join(artifactsDir, "symphony.db"));
  } catch (error_) {
    return {
      phase: "collect-artifacts",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: `Artifact collection failed: ${errorMsg(error_)}` },
    };
  }

  return {
    phase: "collect-artifacts",
    status: "pass",
    durationMs: Date.now() - start,
  };
}

/* ------------------------------------------------------------------ */
/*  Phase 11 — cleanup (ALWAYS runs)                                   */
/* ------------------------------------------------------------------ */

export async function cleanup(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();

  if (ctx.config.cleanup.enabled === false || ctx.keep) {
    return {
      phase: "cleanup",
      status: "pass",
      durationMs: Date.now() - start,
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
    try {
      const apiKey = resolveEnvValue(ctx.config.linear.api_key);
      const teamId = ctx.config.linear.team_id;

      // Parameterized queries — avoids GraphQL injection
      const statesQuery = `
        query TeamStates($teamId: String!) {
          team(id: $teamId) {
            states { nodes { id name } }
          }
        }
      `;
      const statesPayload = (await callLinearGraphQL(apiKey, statesQuery, { teamId })) as {
        data?: { team?: { states?: { nodes?: Array<{ id: string; name: string }> } } };
      };
      const stateNodes = statesPayload.data?.team?.states?.nodes ?? [];
      const canceledState = stateNodes.find((node) => node.name === "Canceled");

      if (canceledState) {
        const mutation = `
          mutation CancelIssue($issueId: String!, $stateId: String!) {
            issueUpdate(id: $issueId, input: { stateId: $stateId }) {
              success
            }
          }
        `;
        await callLinearGraphQL(apiKey, mutation, { issueId: ctx.issueId, stateId: canceledState.id });
        results.issueCanceled = true;
      }
    } catch (error_) {
      console.warn(`[cleanup] failed to cancel issue ${ctx.issueId}: ${errorMsg(error_)}`);
    }
  }

  return {
    phase: "cleanup",
    status: "pass",
    durationMs: Date.now() - start,
    data: results,
  };
}

/* ------------------------------------------------------------------ */
/*  shutdownSymphony — delegates to shared stopProcess from helpers    */
/* ------------------------------------------------------------------ */

export async function shutdownSymphony(ctx: RunContext): Promise<void> {
  if (!ctx.symphonyProcess || ctx.symphonyProcess.exitCode !== null) {
    return;
  }
  const gracefulMs = ctx.config.timeouts.graceful_shutdown_ms ?? 10_000;
  await stopProcess(ctx.symphonyProcess, gracefulMs);
}
