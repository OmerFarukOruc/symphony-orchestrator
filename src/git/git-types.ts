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
