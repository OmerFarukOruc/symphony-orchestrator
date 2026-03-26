import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { Request, Response } from "express";

import { getErrorMessage } from "../../utils/type-guards.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostReset(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    try {
      await deps.orchestrator.stop();
      await Promise.all(deps.secretsStore.list().map((key) => deps.secretsStore.delete(key)));
      delete process.env.GITHUB_TOKEN;
      await Promise.all([
        deps.configOverlayStore.set("codex.auth.mode", ""),
        deps.configOverlayStore.set("codex.auth.source_home", ""),
        deps.configOverlayStore.delete("codex.provider"),
        writeFile(path.join(deps.archiveDir, "master.key"), "", { encoding: "utf8", mode: 0o600 }),
      ]);
      deps.secretsStore.reset();
      res.json({ ok: true });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to reset configuration");
      res.status(500).json({ error: { code: "reset_failed", message } });
    }
  };
}
