import { existsSync } from "node:fs";
import path from "node:path";

import type { SecretsStore } from "../secrets/store.js";
import { isRecord } from "../utils/type-guards.js";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function readOverlayString(overlay: Record<string, unknown>, flatKey: string, nestedPath: string[]): string | null {
  const flatValue = overlay[flatKey];
  if (typeof flatValue === "string") {
    return flatValue;
  }

  let cursor: unknown = overlay;
  for (const segment of nestedPath) {
    if (!isRecord(cursor) || DANGEROUS_KEYS.has(segment)) {
      return null;
    }
    const desc = Object.getOwnPropertyDescriptor(cursor, segment);
    if (!desc) {
      return null;
    }
    cursor = desc.value;
  }

  return typeof cursor === "string" ? cursor : null;
}

export function hasCodexAuthFile(archiveDir: string, overlay: Record<string, unknown>): boolean {
  const authMode = readOverlayString(overlay, "codex.auth.mode", ["codex", "auth", "mode"]);
  const authSourceHome = readOverlayString(overlay, "codex.auth.source_home", ["codex", "auth", "source_home"]);
  if (authMode === "" || authSourceHome === "") {
    return false;
  }

  const authDir = authSourceHome || path.join(archiveDir, "codex-auth");
  return existsSync(path.join(authDir, "auth.json"));
}

export function hasLinearCredentials(secretsStore: SecretsStore): boolean {
  return Boolean(secretsStore.get("LINEAR_API_KEY") ?? process.env.LINEAR_API_KEY ?? "");
}

export function readProjectSlug(overlay: Record<string, unknown>): string | undefined {
  const slug = readOverlayString(overlay, "tracker.project_slug", ["tracker", "project_slug"]);
  return slug || undefined;
}

export function hasRepoRoutes(overlay: Record<string, unknown>): boolean {
  const repos = overlay.repos;
  return Array.isArray(repos) && repos.length > 0;
}
