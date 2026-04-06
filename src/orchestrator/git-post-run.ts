import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { GitPostRunPort } from "../git/port.js";
import type { RepoMatch } from "../git/repo-router.js";
import type { Issue, MergePolicy, RisolutoLogger, Workspace } from "../core/types.js";
import { generatePrSummary } from "../git/pr-summary-generator.js";
import { evaluateMergePolicy } from "../git/merge-policy.js";

const execFileAsync = promisify(execFile);

/**
 * Minimal interface for the auto-merge client dependency.
 * Keeps `executeGitPostRun` decoupled from the concrete `GitHubPrClient`.
 */
interface AutoMergeClient {
  requestAutoMerge(
    owner: string,
    repo: string,
    pullNumber: number,
    mergeMethod: "squash" | "merge" | "rebase",
    tokenEnvName?: string,
  ): Promise<void>;
}

/**
 * Optional context for the auto-merge policy evaluation step.
 * When absent, the auto-merge step is skipped entirely.
 */
export interface AutoMergeContext {
  policy: MergePolicy;
  client: AutoMergeClient;
  logger: RisolutoLogger;
}

/**
 * Fetches changed file paths relative to the default branch using `git diff --name-only`.
 * Returns an empty array on any error so the policy evaluation degrades gracefully.
 */
async function fetchChangedFiles(workspaceDir: string, defaultBranch: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", `${defaultBranch}...HEAD`], {
      cwd: workspaceDir,
    });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * Parses additions and deletions from `git diff --shortstat` output.
 * Returns `{ additions: 0, deletions: 0 }` on any error.
 */
async function fetchDiffStats(
  workspaceDir: string,
  defaultBranch: string,
): Promise<{ additions: number; deletions: number }> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--shortstat", `${defaultBranch}...HEAD`], {
      cwd: workspaceDir,
    });
    // eslint-disable-next-line sonarjs/slow-regex -- bounded git --shortstat output; safe
    const addMatch = /(\d+) insertion/.exec(stdout);
    // eslint-disable-next-line sonarjs/slow-regex -- bounded git --shortstat output; safe
    const delMatch = /(\d+) deletion/.exec(stdout);
    return {
      additions: addMatch ? parseInt(addMatch[1], 10) : 0,
      deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

/**
 * Extracts the numeric PR number from a GitHub PR HTML URL.
 * Returns `null` when the URL does not contain a `/pull/<number>` segment.
 * Uses plain string operations to avoid sonar slow-regex warnings.
 */
function parsePullNumber(htmlUrl: string): number | null {
  const pullSegment = "/pull/";
  const idx = htmlUrl.lastIndexOf(pullSegment);
  if (idx === -1) return null;
  const tail = htmlUrl.slice(idx + pullSegment.length);
  const parsed = parseInt(tail, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Attempts to request auto-merge for a newly created PR when policy allows it.
 * All failures are logged at warn level and never propagate — auto-merge is best-effort.
 */
async function tryRequestAutoMerge(
  autoMerge: AutoMergeContext,
  pullRequestUrl: string,
  issueIdentifier: string,
  issueLabels: string[],
  workspacePath: string,
  repoMatch: RepoMatch,
): Promise<void> {
  const { policy, client, logger } = autoMerge;

  const [changedFiles, diffStats] = await Promise.all([
    fetchChangedFiles(workspacePath, repoMatch.defaultBranch),
    fetchDiffStats(workspacePath, repoMatch.defaultBranch),
  ]);

  const result = evaluateMergePolicy(policy, changedFiles, diffStats, issueLabels);

  if (!result.allowed) {
    logger.info(
      {
        issue_identifier: issueIdentifier,
        pull_request_url: pullRequestUrl,
        reason: result.reason,
        blocked_files: result.blockedFiles,
      },
      "auto-merge blocked by policy",
    );
    return;
  }

  const pullNumber = parsePullNumber(pullRequestUrl);
  const owner = repoMatch.githubOwner ?? null;
  const repo = repoMatch.githubRepo ?? null;
  if (pullNumber === null || !owner || !repo) return;

  try {
    await client.requestAutoMerge(owner, repo, pullNumber, "squash", repoMatch.githubTokenEnv ?? undefined);
    logger.info({ issue_identifier: issueIdentifier, pull_request_url: pullRequestUrl }, "auto-merge requested");
  } catch (mergeError) {
    logger.warn(
      {
        issue_identifier: issueIdentifier,
        pull_request_url: pullRequestUrl,
        error: mergeError instanceof Error ? mergeError.message : String(mergeError),
      },
      "requestAutoMerge failed (non-fatal — repo may not support auto-merge)",
    );
  }
}

export async function executeGitPostRun(
  gitManager: GitPostRunPort,
  workspace: Workspace,
  issue: Issue,
  repoMatch: RepoMatch,
  autoMerge?: AutoMergeContext,
): Promise<{ pullRequestUrl: string | null; summary: string | null }> {
  const commitResult = await gitManager.commitAndPush(
    workspace.path,
    `${issue.identifier}: ${issue.title}`,
    undefined,
    repoMatch.githubTokenEnv,
  );
  if (!commitResult.pushed) {
    return { pullRequestUrl: null, summary: null };
  }

  // Generate agent-authored summary after commit, before PR creation.
  // Failure is non-fatal — PR creation continues without summary.
  let summary: string | null = null;
  try {
    summary = await generatePrSummary(workspace.path, repoMatch.defaultBranch);
  } catch {
    // Intentionally swallowed — summary is best-effort
  }

  const pullRequest = await gitManager.createPullRequest(repoMatch, issue, commitResult.branchName, summary);
  const pullRequestUrl = pullRequest?.html_url ?? null;

  // ── Auto-merge policy evaluation ────────────────────────────────────────
  // Only runs when an AutoMergeContext is provided. All failures are non-fatal.
  if (autoMerge && pullRequestUrl) {
    try {
      await tryRequestAutoMerge(autoMerge, pullRequestUrl, issue.identifier, issue.labels, workspace.path, repoMatch);
    } catch (policyError) {
      autoMerge.logger.warn(
        {
          issue_identifier: issue.identifier,
          error: policyError instanceof Error ? policyError.message : String(policyError),
        },
        "auto-merge policy evaluation failed (non-fatal)",
      );
    }
  }

  return { pullRequestUrl, summary };
}
