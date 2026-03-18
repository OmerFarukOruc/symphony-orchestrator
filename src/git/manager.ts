import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Issue } from "../core/types.js";
import type { RepoMatch } from "./repo-router.js";

const execFileAsync = promisify(execFile);

export interface GitCommandOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
}

export type GitRunner = (args: string[], options: GitCommandOptions) => Promise<GitRunResult>;

export interface GitManagerDeps {
  runGit?: GitRunner;
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  apiBaseUrl?: string;
  defaultGithubTokenEnv?: string;
}

function sanitizeBranchSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

function deriveBranchName(issue: Pick<Issue, "identifier" | "branchName">): string {
  if (issue.branchName && issue.branchName.trim().length > 0) {
    return issue.branchName.trim();
  }
  const slug = sanitizeBranchSegment(issue.identifier) || "issue";
  return `symphony/${slug}`;
}

function parseGithubRepo(repoUrl: string): { owner: string; repo: string } | null {
  const normalized = repoUrl.trim().replace(/\.git$/, "");
  const httpsMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i.exec(normalized);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+)$/i.exec(normalized);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  return null;
}

interface CloneResult {
  branchName: string;
}

interface CommitAndPushResult {
  committed: boolean;
  pushed: boolean;
  branchName: string;
}

export class GitManager {
  private readonly runGit: GitRunner;
  private readonly fetchImpl: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;
  private readonly apiBaseUrl: string;
  private readonly defaultGithubTokenEnv: string;

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
    this.fetchImpl = deps.fetch ?? fetch;
    this.env = deps.env ?? process.env;
    this.apiBaseUrl = deps.apiBaseUrl ?? "https://api.github.com";
    this.defaultGithubTokenEnv = deps.defaultGithubTokenEnv ?? "GITHUB_TOKEN";
  }

  async cloneInto(
    route: RepoMatch,
    workspaceDir: string,
    issue: Pick<Issue, "identifier" | "branchName">,
  ): Promise<CloneResult> {
    const branchName = deriveBranchName(issue);
    await this.runGit(["clone", "--branch", route.defaultBranch, "--single-branch", route.repoUrl, "."], {
      cwd: workspaceDir,
      env: this.env,
    });
    await this.runGit(["checkout", "-b", branchName], { cwd: workspaceDir, env: this.env });
    return { branchName };
  }

  async commitAndPush(workspaceDir: string, message: string, branchName?: string): Promise<CommitAndPushResult> {
    const status = await this.runGit(["status", "--porcelain"], { cwd: workspaceDir, env: this.env });
    const resolvedBranch = branchName ?? (await this.currentBranch(workspaceDir));
    if (status.stdout.trim().length === 0) {
      return { committed: false, pushed: false, branchName: resolvedBranch };
    }

    await this.runGit(["add", "-A"], { cwd: workspaceDir, env: this.env });
    await this.runGit(["commit", "-m", message], { cwd: workspaceDir, env: this.env });
    await this.runGit(["push", "-u", "origin", resolvedBranch], { cwd: workspaceDir, env: this.env });
    return { committed: true, pushed: true, branchName: resolvedBranch };
  }

  async createPullRequest(
    route: RepoMatch,
    issue: Pick<Issue, "identifier" | "title" | "url">,
    branchName: string,
  ): Promise<unknown> {
    const owner = route.githubOwner ?? parseGithubRepo(route.repoUrl)?.owner;
    const repo = route.githubRepo ?? parseGithubRepo(route.repoUrl)?.repo;
    if (!owner || !repo) {
      throw new Error("unable to derive github owner/repo for pull request creation");
    }

    const tokenEnvName = route.githubTokenEnv || "GITHUB_TOKEN";
    const response = await this.githubRequest(
      `/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: `${issue.identifier}: ${issue.title}`,
          head: branchName,
          base: route.defaultBranch,
          body: issue.url ? `Source issue: ${issue.url}` : undefined,
        }),
      },
      tokenEnvName,
    );
    return response;
  }

  async addPrComment(input: {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    tokenEnvName?: string;
  }): Promise<unknown> {
    return this.githubRequest(
      `/repos/${input.owner}/${input.repo}/issues/${input.pullNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body: input.body }),
      },
      input.tokenEnvName,
    );
  }

  async getPrStatus(input: {
    owner: string;
    repo: string;
    pullNumber: number;
    tokenEnvName?: string;
  }): Promise<unknown> {
    return this.githubRequest(
      `/repos/${input.owner}/${input.repo}/pulls/${input.pullNumber}`,
      {
        method: "GET",
      },
      input.tokenEnvName,
    );
  }

  private async currentBranch(workspaceDir: string): Promise<string> {
    const result = await this.runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: workspaceDir, env: this.env });
    return result.stdout.trim() || "main";
  }

  private async githubRequest(
    pathName: string,
    init: { method: string; body?: string },
    tokenEnvName = this.defaultGithubTokenEnv,
  ): Promise<unknown> {
    const token = this.env[tokenEnvName];
    if (!token) {
      throw new Error(`missing GitHub token env var: ${tokenEnvName}`);
    }

    const response = await this.fetchImpl(`${this.apiBaseUrl}${pathName}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "user-agent": "symphony-orchestrator",
      },
      body: init.body,
    });
    const text = await response.text();
    const payload = text.length > 0 ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`github request failed with status ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload;
  }
}
