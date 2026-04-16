import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Issue, RisolutoLogger } from "../core/types.js";
import { GitHubPrClient } from "./github-pr-client.js";
import type { PrStatusResponse } from "./github-pr-client.js";
import type { GitIntegrationPort } from "./port.js";
import type { RepoMatch } from "./repo-router.js";
import type { GitRunner, PrCreateResult } from "./git-types.js";
export type { GitCommandOptions, GitRunResult, GitRunner } from "./git-types.js";
import {
  ensureBaseClone,
  syncBaseClone,
  addWorktree,
  attachWorktree,
  removeWorktree as removeWorktreePrimitive,
  branchExists,
  deriveRepoKey,
  type WorktreeContext,
} from "./worktree-manager.js";

const execFileAsync = promisify(execFile);

export interface GitManagerDeps {
  runGit?: GitRunner;
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  apiBaseUrl?: string;
  defaultGithubTokenEnv?: string;
  logger?: RisolutoLogger;
}

function sanitizeBranchSegment(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9._/-]/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^[-/]+/, "")
    .replace(/[-/]+$/, "");
}

function deriveBranchName(issue: Pick<Issue, "identifier" | "branchName">, branchPrefix = "risoluto/"): string {
  const provided = issue.branchName?.trim();
  // Reject tracker-supplied names starting with "-" to prevent flag injection
  // into git commands (e.g. a branchName of "--force" becomes a flag arg).
  if (provided && provided.length > 0 && !provided.startsWith("-")) {
    return provided;
  }
  const slug = sanitizeBranchSegment(issue.identifier) || "issue";
  return `${branchPrefix}${slug}`;
}

interface CloneResult {
  branchName: string;
}
interface CommitAndPushResult {
  committed: boolean;
  pushed: boolean;
  branchName: string;
}

export class GitManager implements GitIntegrationPort {
  private readonly runGit: GitRunner;
  private readonly env: NodeJS.ProcessEnv;
  private readonly defaultGithubTokenEnv: string;
  private readonly logger: RisolutoLogger | null;
  private readonly githubPrClient: GitHubPrClient;

  constructor(deps: GitManagerDeps = {}) {
    this.runGit =
      deps.runGit ??
      (async (args, options) => {
        const result = await execFileAsync("git", args, { cwd: options.cwd, env: options.env ?? process.env });
        return {
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
        };
      });
    this.env = deps.env ?? process.env;
    this.defaultGithubTokenEnv = deps.defaultGithubTokenEnv ?? "GITHUB_TOKEN";
    this.logger = deps.logger ?? null;
    this.githubPrClient = new GitHubPrClient({
      fetch: deps.fetch,
      env: this.env,
      apiBaseUrl: deps.apiBaseUrl,
      defaultGithubTokenEnv: this.defaultGithubTokenEnv,
    });
  }

  private getWorktreeContext(): WorktreeContext {
    return {
      runGit: this.runGit,
      env: this.env,
      logger: this.logger ?? {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        child: () => this.logger ?? ({} as RisolutoLogger),
      },
    };
  }

  deriveBaseCloneDir(workspaceRoot: string, repoUrl: string): string {
    return path.join(workspaceRoot, ".base", `${deriveRepoKey(repoUrl)}.git`);
  }

  async hasUncommittedChanges(workspaceDir: string): Promise<boolean> {
    const status = await this.runGit(["status", "--porcelain"], { cwd: workspaceDir, env: this.env });
    return status.stdout.trim().length > 0;
  }

  async autoCommit(workspaceDir: string, message: string, options?: { noVerify?: boolean }): Promise<string> {
    await this.runGit(["add", "-A"], { cwd: workspaceDir, env: this.env });
    const args = ["commit"];
    if (options?.noVerify) {
      args.push("--no-verify");
    }
    args.push("-m", message);
    await this.runGit(args, { cwd: workspaceDir, env: this.env });
    return this.currentCommitSha(workspaceDir);
  }

  async setupWorktree(
    route: RepoMatch,
    baseCloneDir: string,
    worktreePath: string,
    issue: Pick<Issue, "identifier" | "branchName">,
    branchPrefix?: string,
  ): Promise<{ branchName: string }> {
    const ctx = this.getWorktreeContext();
    await ensureBaseClone(ctx, route.repoUrl, baseCloneDir);
    await syncBaseClone(ctx, baseCloneDir);

    const branchName = deriveBranchName(issue, branchPrefix);
    const startPoint = route.defaultBranch;

    if (await branchExists(ctx, baseCloneDir, branchName)) {
      await attachWorktree(ctx, baseCloneDir, worktreePath, branchName);
    } else {
      await addWorktree(ctx, baseCloneDir, worktreePath, branchName, startPoint);
    }
    return { branchName };
  }

  async syncWorktree(baseCloneDir: string): Promise<void> {
    const ctx = this.getWorktreeContext();
    await syncBaseClone(ctx, baseCloneDir);
  }

  async removeWorktree(baseCloneDir: string, worktreePath: string, force = true): Promise<void> {
    const ctx = this.getWorktreeContext();
    await removeWorktreePrimitive(ctx, baseCloneDir, worktreePath, force);
  }

  async cloneInto(
    route: RepoMatch,
    workspaceDir: string,
    issue: Pick<Issue, "identifier" | "branchName">,
    branchPrefix?: string,
  ): Promise<CloneResult> {
    const branchName = deriveBranchName(issue, branchPrefix);
    await this.runGit(["clone", "--branch", route.defaultBranch, "--single-branch", route.repoUrl, "."], {
      cwd: workspaceDir,
      env: this.env,
    });
    await this.runGit(["checkout", "-b", branchName], { cwd: workspaceDir, env: this.env });
    return { branchName };
  }
  async commitAndPush(
    workspaceDir: string,
    message: string,
    branchName?: string,
    tokenEnvName?: string,
  ): Promise<CommitAndPushResult> {
    const resolvedBranch = branchName ?? (await this.currentBranch(workspaceDir));
    if (!(await this.hasUncommittedChanges(workspaceDir))) {
      return { committed: false, pushed: false, branchName: resolvedBranch };
    }

    await this.autoCommit(workspaceDir, message);
    await this.pushWithToken(workspaceDir, resolvedBranch, tokenEnvName);
    return { committed: true, pushed: true, branchName: resolvedBranch };
  }
  async createPullRequest(
    route: RepoMatch,
    issue: Pick<Issue, "identifier" | "title" | "url">,
    branchName: string,
    summary?: string | null,
  ): Promise<PrCreateResult | undefined> {
    return this.githubPrClient.createPullRequest(route, issue, branchName, summary);
  }

  async forcePushIfBranchExists(branchName: string, workspaceDir: string): Promise<void> {
    await this.runGit(["push", "--force-with-lease", "origin", branchName], {
      cwd: workspaceDir,
      env: this.env,
    });
  }

  async diffNameOnly(repoDir: string, fromRef: string): Promise<string[]> {
    try {
      const result = await this.runGit(["diff", "--name-only", `${fromRef}...HEAD`], {
        cwd: repoDir,
        env: this.env,
      });
      return result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  async diffShortStat(repoDir: string, fromRef: string): Promise<{ additions: number; deletions: number }> {
    try {
      const result = await this.runGit(["diff", "--shortstat", `${fromRef}...HEAD`], {
        cwd: repoDir,
        env: this.env,
      });
      const addMatch = /(\d+) insertion/.exec(result.stdout);
      const delMatch = /(\d+) deletion/.exec(result.stdout);
      return {
        additions: addMatch ? parseInt(addMatch[1], 10) : 0,
        deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
      };
    } catch {
      return { additions: 0, deletions: 0 };
    }
  }
  async addPrComment(input: {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    tokenEnvName?: string;
  }): Promise<unknown> {
    return this.githubPrClient.addPrComment(input);
  }
  async getPrStatus(input: {
    owner: string;
    repo: string;
    pullNumber: number;
    tokenEnvName?: string;
  }): Promise<PrStatusResponse> {
    return this.githubPrClient.getPrStatus(input);
  }
  private async pushWithToken(workspaceDir: string, branch: string, tokenEnvName?: string): Promise<void> {
    const envName = tokenEnvName ?? this.defaultGithubTokenEnv;
    const token = this.env[envName];
    if (token) {
      const encodedAuth = Buffer.from(`x-access-token:${token}`).toString("base64");
      await this.runGit(
        ["-c", `http.extraHeader=Authorization: Basic ${encodedAuth}`, "push", "-u", "origin", branch],
        { cwd: workspaceDir, env: this.env },
      );
    } else {
      await this.runGit(["push", "-u", "origin", branch], { cwd: workspaceDir, env: this.env });
    }
  }
  private async currentBranch(workspaceDir: string): Promise<string> {
    const result = await this.runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: workspaceDir, env: this.env });
    return result.stdout.trim() || "main";
  }

  private async currentCommitSha(workspaceDir: string): Promise<string> {
    const result = await this.runGit(["rev-parse", "HEAD"], { cwd: workspaceDir, env: this.env });
    return result.stdout.trim();
  }
}
