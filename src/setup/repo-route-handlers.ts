import type { FastifyReply, FastifyRequest } from "fastify";

import type { ConfigOverlayStore } from "../config/overlay.js";
import { isRecord } from "../utils/type-guards.js";

const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/u;

export interface RepoRouteApiDeps {
  configOverlayStore: ConfigOverlayStore;
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
  return async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
    const repoUrl = parseRepoUrl(request.body);
    if (!repoUrl) {
      reply.status(400).send({
        error: {
          code: "invalid_repo_url",
          message: "repoUrl must be a valid GitHub URL (https://github.com/org/repo)",
        },
      });
      return;
    }

    const identifierPrefix = parseIdentifierPrefix(request.body);
    if (!identifierPrefix) {
      reply.status(400).send({
        error: { code: "missing_prefix", message: "identifierPrefix is required" },
      });
      return;
    }

    const defaultBranch = parseDefaultBranch(request.body);
    const label = parseLabel(request.body);

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

    reply.send({ ok: true, route: entry });
  };
}

export function handleGetRepoRoutes(deps: RepoRouteApiDeps) {
  return (_request: FastifyRequest, reply: FastifyReply) => {
    const overlay = deps.configOverlayStore.toMap();
    const routes = readRepos(overlay);
    reply.send({ routes });
  };
}

export function handleDeleteRepoRoute(deps: RepoRouteApiDeps) {
  return async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
    const body = request.body;
    const index = isRecord(body) && typeof body.index === "number" && Number.isInteger(body.index) ? body.index : -1;

    const overlay = deps.configOverlayStore.toMap();
    const existing = readRepos(overlay);

    if (index < 0 || index >= existing.length) {
      reply.status(400).send({
        error: { code: "invalid_index", message: `index must be between 0 and ${existing.length - 1}` },
      });
      return;
    }

    existing.splice(index, 1);
    await deps.configOverlayStore.set("repos", existing);

    reply.send({ ok: true, routes: existing });
  };
}
