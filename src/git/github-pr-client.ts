import type { Issue } from "../core/types.js";
import type { GithubApiToolClient } from "./github-api-tool.js";
import type { RepoMatch } from "./repo-router.js";

export interface GitHubPrClientDeps {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  apiBaseUrl?: string;
  defaultGithubTokenEnv?: string;
}

class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`github request failed with status ${status}: ${JSON.stringify(payload)}`, { cause: payload });
    this.name = "GitHubApiError";
  }
}

function isDuplicatePrError(error: unknown): boolean {
  return (
    error instanceof GitHubApiError &&
    error.status === 422 &&
    typeof error.payload === "object" &&
    error.payload !== null &&
    JSON.stringify(error.payload).includes("already exists")
  );
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

export class GitHubPrClient implements GithubApiToolClient {
  private readonly fetchImpl: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;
  private readonly apiBaseUrl: string;
  private readonly defaultGithubTokenEnv: string;

  constructor(deps: GitHubPrClientDeps = {}) {
    this.fetchImpl = deps.fetch ?? fetch;
    this.env = deps.env ?? process.env;
    this.apiBaseUrl = deps.apiBaseUrl ?? "https://api.github.com";
    this.defaultGithubTokenEnv = deps.defaultGithubTokenEnv ?? "GITHUB_TOKEN";
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

    const tokenEnvName = route.githubTokenEnv || this.defaultGithubTokenEnv;
    const body = JSON.stringify({
      title: `${issue.identifier}: ${issue.title}`,
      head: branchName,
      base: route.defaultBranch,
      body: issue.url ? `Source issue: ${issue.url}` : undefined,
    });
    try {
      return await this.githubRequest(`/repos/${owner}/${repo}/pulls`, { method: "POST", body }, tokenEnvName);
    } catch (error) {
      if (!isDuplicatePrError(error)) throw error;
      const existing = await this.githubRequest(
        `/repos/${owner}/${repo}/pulls?head=${owner}:${branchName}&state=open`,
        { method: "GET" },
        tokenEnvName,
      );
      return Array.isArray(existing) && existing.length > 0 ? existing[0] : undefined;
    }
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
        "user-agent": "risoluto",
      },
      body: init.body,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      throw new GitHubApiError(response.status, payload);
    }
    return payload;
  }
}
