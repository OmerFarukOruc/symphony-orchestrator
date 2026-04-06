import type { Request, Response } from "express";

import type { SecretsPort } from "../secrets/port.js";
import { isRecord } from "../utils/type-guards.js";

const GITHUB_URL_RE = /^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/iu;
const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_FALLBACK = "main";

export interface DetectDefaultBranchDeps {
  secretsStore: SecretsPort;
  fetchImpl?: typeof fetch;
}

function parseOwnerRepo(url: string): { owner: string; repo: string } | null {
  const match = GITHUB_URL_RE.exec(url.trim());
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function resolveToken(deps: DetectDefaultBranchDeps): string | null {
  const fromSecrets = deps.secretsStore.get("GITHUB_TOKEN") ?? null;
  if (fromSecrets) return fromSecrets;
  return process.env.GITHUB_TOKEN ?? null;
}

async function fetchDefaultBranch(
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
      const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
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
  const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
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
  return DEFAULT_FALLBACK;
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
      res.json({ defaultBranch: DEFAULT_FALLBACK });
    }
  };
}
