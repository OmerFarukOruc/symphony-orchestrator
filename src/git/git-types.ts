/** Shared git types extracted to break the manager ↔ worktree-manager import cycle. */

export interface GitCommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
}

export type GitRunner = (args: string[], options: GitCommandOptions) => Promise<GitRunResult>;

/**
 * Typed subset of the GitHub REST API response for a newly created (or
 * found existing) pull request. Returned by `GitPostRunPort.createPullRequest`.
 */
export interface PrCreateResult {
  html_url: string;
  number: number;
  state: "open" | "closed";
}

/**
 * Typed shape of the GitHub REST API response for a single pull request.
 * Used by `getPrStatus()` and the PR monitor polling loop.
 */
export interface PrStatusResponse {
  state: "open" | "closed";
  merged: boolean;
  number: number;
  html_url: string;
  merge_commit_sha: string | null;
}

export interface GithubApiToolClient {
  addPrComment(input: { owner: string; repo: string; pullNumber: number; body: string }): Promise<unknown>;
  getPrStatus(input: { owner: string; repo: string; pullNumber: number }): Promise<PrStatusResponse>;
}
