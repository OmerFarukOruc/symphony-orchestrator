import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Request, Response } from "express";

import { normalizeCodexAuthJson } from "../../codex/auth-file.js";
import { isRecord } from "../../utils/type-guards.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostCodexAuth(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    const body = req.body;
    const authJson = isRecord(body) && typeof body.authJson === "string" ? body.authJson : null;
    if (!authJson) {
      res.status(400).json({ error: { code: "missing_auth_json", message: "authJson is required" } });
      return;
    }

    try {
      JSON.parse(authJson);
    } catch {
      res.status(400).json({ error: { code: "invalid_json", message: "authJson must be valid JSON" } });
      return;
    }

    try {
      const normalizedAuthJson = normalizeCodexAuthJson(authJson);
      const authDir = path.join(deps.archiveDir, "codex-auth");
      await mkdir(authDir, { recursive: true });
      await writeFile(path.join(authDir, "auth.json"), normalizedAuthJson, { encoding: "utf8", mode: 0o600 });

      await Promise.all([
        deps.configOverlayStore.set("codex.auth.mode", "openai_login"),
        deps.configOverlayStore.set("codex.auth.source_home", authDir),
        deps.configOverlayStore.delete("codex.provider"),
      ]);

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: { code: "save_error", message: String(error) } });
    }
  };
}
