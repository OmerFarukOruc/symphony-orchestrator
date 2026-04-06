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
