import type { Request, Response } from "express";

import type { ConfigOverlayPort } from "../config/overlay.js";
import type { SecretsStore } from "../secrets/store.js";
import { isRecord } from "../utils/type-guards.js";

const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/u;

export interface RepoRouteApiDeps {
  configOverlayStore: ConfigOverlayPort;
  secretsStore: SecretsStore;
}

interface RepoEntry {
  repo_url: string;
  default_branch: string;
  identifier_prefix: string;
  label?: string;
}

function readRepos(overlay: Record<string, unknown>): RepoEntry[] {
  const raw = overlay.repos;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is RepoEntry =>
      isRecord(entry) && typeof entry.repo_url === "string" && typeof entry.identifier_prefix === "string",
  );
}

function parseRepoUrl(body: unknown): string | null {
  if (!isRecord(body) || typeof body.repoUrl !== "string") {
    return null;
  }
  const url = body.repoUrl.trim();
  if (!GITHUB_URL_RE.test(url)) {
    return null;
  }
  return url;
}

function parseDefaultBranch(body: unknown): string {
  if (isRecord(body) && typeof body.defaultBranch === "string" && body.defaultBranch.trim()) {
    return body.defaultBranch.trim();
  }
  return "main";
}

function parseIdentifierPrefix(body: unknown): string | null {
  if (isRecord(body) && typeof body.identifierPrefix === "string" && body.identifierPrefix.trim()) {
    return body.identifierPrefix.trim().toUpperCase();
  }
  return null;
}

function parseLabel(body: unknown): string | undefined {
  if (isRecord(body) && typeof body.label === "string" && body.label.trim()) {
    return body.label.trim();
  }
  return undefined;
}

export function handlePostRepoRoute(deps: RepoRouteApiDeps) {
  return async (req: Request, res: Response) => {
    const repoUrl = parseRepoUrl(req.body);
    if (!repoUrl) {
      res.status(400).json({
        error: {
          code: "invalid_repo_url",
          message: "repoUrl must be a valid GitHub URL (https://github.com/org/repo)",
        },
      });
      return;
    }

    const identifierPrefix = parseIdentifierPrefix(req.body);
    if (!identifierPrefix) {
      res.status(400).json({
        error: { code: "missing_prefix", message: "identifierPrefix is required" },
      });
      return;
    }

    const defaultBranch = parseDefaultBranch(req.body);
    const label = parseLabel(req.body);

    const overlay = deps.configOverlayStore.toMap();
    const existing = readRepos(overlay);

    const filtered = existing.filter((r) => r.identifier_prefix !== identifierPrefix);

    const entry: RepoEntry = {
      repo_url: repoUrl,
      default_branch: defaultBranch,
      identifier_prefix: identifierPrefix,
      ...(label ? { label } : {}),
    };
    filtered.push(entry);

    await deps.configOverlayStore.set("repos", filtered);

    res.json({ ok: true, route: entry });
  };
}

export function handleGetRepoRoutes(deps: RepoRouteApiDeps) {
  return (_req: Request, res: Response) => {
    const overlay = deps.configOverlayStore.toMap();
    const routes = readRepos(overlay);
    res.json({ routes });
  };
}

export function handleDeleteRepoRoute(deps: RepoRouteApiDeps) {
  return async (req: Request, res: Response) => {
    const rawIndex = Array.isArray(req.params.index) ? req.params.index[0] : req.params.index;
    const index = rawIndex !== undefined && /^\d+$/.test(rawIndex) ? Number(rawIndex) : Number.NaN;

    const overlay = deps.configOverlayStore.toMap();
    const existing = readRepos(overlay);

    if (!Number.isInteger(index) || index < 0 || index >= existing.length) {
      res.status(400).json({
        error: { code: "invalid_index", message: `index must be between 0 and ${existing.length - 1}` },
      });
      return;
    }

    existing.splice(index, 1);
    await deps.configOverlayStore.set("repos", existing);

    res.json({ ok: true, routes: existing });
  };
}
