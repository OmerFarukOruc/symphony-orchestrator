import type { Request, Response } from "express";

import type { SecretsPort } from "../secrets/port.js";
import { isRecord } from "../utils/type-guards.js";

export interface DetectDefaultBranchDeps {
  secretsStore: SecretsPort;
  fetchImpl?: typeof fetch;
}

function getGitHubApiBase(): string {
  return "https://api.github.com";
}

function getDefaultFallback(): string {
  return "main";
}

function isSupportedGitHubHost(hostname: string): boolean {
  return hostname === "github.com" || hostname === "www.github.com";
}

function isGitHubSegment(value: string): boolean {
  return /^[\w.-]+$/u.test(value);
}

export function parseOwnerRepo(url: string): { owner: string; repo: string } | null {
  if (url !== url.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !isSupportedGitHubHost(parsed.hostname) || parsed.search || parsed.hash) {
      return null;
    }

    const normalizedPath = parsed.pathname.endsWith("/") ? parsed.pathname.slice(0, -1) : parsed.pathname;
    const segments = normalizedPath.split("/");
    if (segments.length !== 3) {
      return null;
    }

    const [, owner, rawRepo] = segments;
    const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;
    if (!isGitHubSegment(owner) || !isGitHubSegment(repo)) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

export function resolveToken(deps: DetectDefaultBranchDeps): string | null {
  const fromSecrets = deps.secretsStore.get("GITHUB_TOKEN") ?? null;
  if (fromSecrets) return fromSecrets;
  return process.env.GITHUB_TOKEN ?? null;
}

export async function fetchDefaultBranch(
  owner: string,
  repo: string,
  token: string | null,
  fetchImpl: typeof fetch,
): Promise<string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "risoluto",
    "x-github-api-version": "2022-11-28",
  };

  // Strategy: try authenticated first, then unauthenticated
  if (token) {
    try {
      const response = await fetchImpl(`${getGitHubApiBase()}/repos/${owner}/${repo}`, {
        method: "GET",
        headers: { ...headers, authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        if (typeof data.default_branch === "string") {
          return data.default_branch;
        }
      }
    } catch {
      // Authenticated request failed — fall through to unauthenticated
    }
  }

  // Unauthenticated fallback (works for public repos)
  const response = await fetchImpl(`${getGitHubApiBase()}/repos/${owner}/${repo}`, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.default_branch === "string") {
    return data.default_branch;
  }
  return getDefaultFallback();
}

export function handleDetectDefaultBranch(deps: DetectDefaultBranchDeps) {
  return async (req: Request, res: Response) => {
    const body = req.body;
    const repoUrl = isRecord(body) && typeof body.repoUrl === "string" ? body.repoUrl.trim() : null;
    if (!repoUrl) {
      res.status(400).json({
        error: { code: "missing_repo_url", message: "repoUrl is required" },
      });
      return;
    }

    const parsed = parseOwnerRepo(repoUrl);
    if (!parsed) {
      res.status(400).json({
        error: { code: "invalid_repo_url", message: "repoUrl must be a valid GitHub URL" },
      });
      return;
    }

    const token = resolveToken(deps);
    const fetchImpl = deps.fetchImpl ?? fetch;

    try {
      const defaultBranch = await fetchDefaultBranch(parsed.owner, parsed.repo, token, fetchImpl);
      res.json({ defaultBranch });
    } catch {
      // Always return a usable fallback — the branch input is still editable
      res.json({ defaultBranch: getDefaultFallback() });
    }
  };
}
