import type { Issue } from "../core/types.js";
import type { GithubApiToolClient } from "./github-api-tool.js";
import type { PrCreateResult } from "./git-types.js";
import type { RepoMatch } from "./repo-router.js";

export interface GitCloneResult {
  branchName: string;
}

export interface GitCommitAndPushResult {
  committed: boolean;
  pushed: boolean;
  branchName: string;
}

export interface GitWorktreePort {
  hasUncommittedChanges(workspaceDir: string): Promise<boolean>;
  autoCommit(workspaceDir: string, message: string, options?: { noVerify?: boolean }): Promise<string>;
  deriveBaseCloneDir(workspaceRoot: string, repoUrl: string): string;
  setupWorktree(
    route: RepoMatch,
    baseCloneDir: string,
    worktreePath: string,
    issue: Pick<Issue, "identifier" | "branchName">,
    branchPrefix?: string,
  ): Promise<GitCloneResult>;
  syncWorktree(baseCloneDir: string): Promise<void>;
  removeWorktree(baseCloneDir: string, worktreePath: string, force?: boolean): Promise<void>;
  cloneInto(
    route: RepoMatch,
    workspaceDir: string,
    issue: Pick<Issue, "identifier" | "branchName">,
    branchPrefix?: string,
  ): Promise<GitCloneResult>;
}

export interface GitPostRunPort {
  commitAndPush(
    workspaceDir: string,
    message: string,
    branchName?: string,
    tokenEnvName?: string,
    options?: { forcePushIfBranchExists?: boolean },
  ): Promise<GitCommitAndPushResult>;
  createPullRequest(
    route: RepoMatch,
    issue: Pick<Issue, "identifier" | "title" | "url">,
    branchName: string,
    summary?: string | null,
  ): Promise<PrCreateResult | undefined>;
  /**
   * Force-pushes the local branch to the remote using `--force-with-lease`.
   * Aborts with an error if the remote branch has advanced since the last
   * fetch — callers must NOT retry automatically on failure.
   */
  forcePushIfBranchExists(branchName: string, workspaceDir: string): Promise<void>;
}

export interface GitIntegrationPort extends GitWorktreePort, GitPostRunPort, GithubApiToolClient {}
