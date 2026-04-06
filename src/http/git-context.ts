import type { Request, Response } from "express";

import type { ConfigStore } from "../config/store.js";
import type { RuntimeIssueView, RuntimeSnapshot } from "../core/types.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { SecretsPort } from "../secrets/port.js";

/* ------------------------------------------------------------------ */
/*  Response types                                                     */
/* ------------------------------------------------------------------ */

interface GitPullView {
  number: number;
  title: string;
  author: string;
  state: string;
  updatedAt: string;
  url: string;
  headBranch: string;
  checksStatus: string | null;
}

interface GitCommitView {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface GitRepoView {
  repoUrl: string;
  defaultBranch: string;
  identifierPrefix: string | null;
  label: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  configured: boolean;
  github?: {
    description: string | null;
    visibility: string;
    openPrCount: number;
    pulls: GitPullView[];
    recentCommits: GitCommitView[];
  };
}

interface ActiveBranchView {
  identifier: string;
  branchName: string;
  status: string;
  workspacePath: string | null;
  issueTitle: string;
  pullRequestUrl: string | null;
}

interface GitContextResponse {
  repos: GitRepoView[];
  activeBranches: ActiveBranchView[];
  githubAvailable: boolean;
}

/* ------------------------------------------------------------------ */
/*  GitHub API helpers                                                  */
/* ------------------------------------------------------------------ */

const GITHUB_API_BASE = "https://api.github.com";

interface GitHubFetchOptions {
  token: string;
  fetchImpl?: typeof fetch;
}

async function githubGet(path: string, options: GitHubFetchOptions): Promise<unknown> {
  const impl = options.fetchImpl ?? fetch;
  const response = await impl(`${GITHUB_API_BASE}${path}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${options.token}`,
      accept: "application/vnd.github+json",
      "user-agent": "risoluto",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned ${response.status}`);
  }
  return response.json();
}

import { asNumber, asRecord, asString } from "../config/coercion.js";

function parseRepoPulls(raw: unknown): GitPullView[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((pr) => {
    const record = asRecord(pr);
    const user = asRecord(record.user);
    const head = asRecord(record.head);
    return {
      number: asNumber(record.number, 0),
      title: asString(record.title),
      author: asString(user?.login),
      state: asString(record.state),
      updatedAt: asString(record.updated_at),
      url: asString(record.html_url),
      headBranch: asString(head?.ref),
      checksStatus: null,
    };
  });
}

function parseRepoCommits(raw: unknown): GitCommitView[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((entry) => {
    const record = asRecord(entry);
    const commit = asRecord(record.commit);
    const author = asRecord(commit.author);
    return {
      sha: asString(record.sha).slice(0, 7),
      message: asString(commit?.message).split("\n")[0],
      author: asString(author?.name),
      date: asString(author?.date),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Active branch extraction                                           */
/* ------------------------------------------------------------------ */

function extractActiveBranches(snapshot: RuntimeSnapshot): ActiveBranchView[] {
  const branches: ActiveBranchView[] = [];
  const lists: Array<{ issues: RuntimeIssueView[]; status: string }> = [
    { issues: snapshot.running, status: "running" },
    { issues: snapshot.retrying, status: "retrying" },
  ];
  for (const { issues, status } of lists) {
    for (const issue of issues) {
      if (issue.branchName) {
        branches.push({
          identifier: issue.identifier,
          branchName: issue.branchName,
          status,
          workspacePath: issue.workspacePath ?? null,
          issueTitle: issue.title,
          pullRequestUrl: issue.pullRequestUrl ?? null,
        });
      }
    }
  }
  return branches;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export interface GitContextDeps {
  orchestrator: OrchestratorPort;
  configStore?: ConfigStore;
  secretsStore?: SecretsPort;
  fetchImpl?: typeof fetch;
}

function resolveGithubToken(deps: GitContextDeps): string | null {
  const fromSecrets = deps.secretsStore?.get("GITHUB_TOKEN") ?? null;
  if (fromSecrets) return fromSecrets;
  return process.env.GITHUB_TOKEN ?? null;
}

async function enrichConfiguredRepo(
  repo: {
    repoUrl: string;
    defaultBranch: string;
    identifierPrefix: string | null;
    label?: string | null;
    githubOwner?: string | null;
    githubRepo?: string | null;
  },
  fetchOptions: GitHubFetchOptions,
): Promise<GitRepoView> {
  const view: GitRepoView = {
    repoUrl: repo.repoUrl,
    defaultBranch: repo.defaultBranch,
    identifierPrefix: repo.identifierPrefix,
    label: repo.label ?? null,
    githubOwner: repo.githubOwner ?? null,
    githubRepo: repo.githubRepo ?? null,
    configured: true,
  };

  if (repo.githubOwner && repo.githubRepo) {
    try {
      const [repoData, pullsData, commitsData] = await Promise.all([
        githubGet(`/repos/${repo.githubOwner}/${repo.githubRepo}`, fetchOptions),
        githubGet(`/repos/${repo.githubOwner}/${repo.githubRepo}/pulls?state=open&per_page=10`, fetchOptions),
        githubGet(
          `/repos/${repo.githubOwner}/${repo.githubRepo}/commits?per_page=5&sha=${encodeURIComponent(repo.defaultBranch)}`,
          fetchOptions,
        ),
      ]);

      const repoRecord = asRecord(repoData);
      const pulls = parseRepoPulls(pullsData);
      view.github = {
        description: asString(repoRecord.description) || null,
        visibility: asString(repoRecord.visibility) || "unknown",
        openPrCount: pulls.length,
        pulls,
        recentCommits: parseRepoCommits(commitsData),
      };
    } catch {
      // GitHub API failed — return config-only data
    }
  }

  return view;
}

export async function handleGitContext(deps: GitContextDeps, _req: Request, res: Response): Promise<void> {
  const config = deps.configStore?.getConfig() ?? null;
  const repoConfigs = config?.repos ?? [];
  const snapshot = deps.orchestrator.getSnapshot();
  const token = resolveGithubToken(deps);
  const fetchOptions: GitHubFetchOptions = { token: token ?? "", fetchImpl: deps.fetchImpl };

  const enrichedRepos = await Promise.all(
    repoConfigs.map((repo) =>
      token
        ? enrichConfiguredRepo(repo, fetchOptions)
        : Promise.resolve({
            repoUrl: repo.repoUrl,
            defaultBranch: repo.defaultBranch,
            identifierPrefix: repo.identifierPrefix,
            label: repo.label ?? null,
            githubOwner: repo.githubOwner ?? null,
            githubRepo: repo.githubRepo ?? null,
            configured: true,
          } satisfies GitRepoView),
    ),
  );

  const response: GitContextResponse = {
    repos: enrichedRepos,
    activeBranches: extractActiveBranches(snapshot),
    githubAvailable: token !== null,
  };

  res.json(response);
}
