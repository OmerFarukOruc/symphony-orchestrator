import { existsSync } from "node:fs";
import path from "node:path";

import type { SecretsPort } from "../secrets/port.js";
import { isRecord } from "../utils/type-guards.js";

export function readOverlayString(
  overlay: Record<string, unknown>,
  flatKey: string,
  nestedPath: string[],
): string | null {
  const flatValue = overlay[flatKey];
  if (typeof flatValue === "string") {
    return flatValue;
  }

  let cursor: unknown = overlay;
  for (const segment of nestedPath) {
    if (!isRecord(cursor)) {
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

export function readCodexAuthMode(overlay: Record<string, unknown>): string | null {
  return readOverlayString(overlay, "codex.auth.mode", ["codex", "auth", "mode"]);
}

export function readCodexAuthSourceHome(overlay: Record<string, unknown>): string | null {
  return readOverlayString(overlay, "codex.auth.source_home", ["codex", "auth", "source_home"]);
}

export function hasCodexAuthFile(archiveDir: string, overlay: Record<string, unknown>): boolean {
  const authMode = readCodexAuthMode(overlay);
  const authSourceHome = readCodexAuthSourceHome(overlay);
  if (authMode === "" || authSourceHome === "") {
    return false;
  }

  const authDir = authSourceHome || path.join(archiveDir, "codex-auth");
  return existsSync(path.join(authDir, "auth.json"));
}

export function hasLinearCredentials(secretsStore: SecretsPort): boolean {
  return Boolean(secretsStore.get("LINEAR_API_KEY") ?? process.env.LINEAR_API_KEY ?? "");
}

export function readProjectSlug(overlay: Record<string, unknown>): string | undefined {
  const slug = readOverlayString(overlay, "tracker.project_slug", ["tracker", "project_slug"]);
  return slug || undefined;
}

export function readTrackerKind(overlay: Record<string, unknown>): string | undefined {
  const kind = readOverlayString(overlay, "tracker.kind", ["tracker", "kind"]);
  return kind || undefined;
}

export function hasRepoRoutes(overlay: Record<string, unknown>): boolean {
  const repos = overlay.repos;
  return Array.isArray(repos) && repos.length > 0;
}
