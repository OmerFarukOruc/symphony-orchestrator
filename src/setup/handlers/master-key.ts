import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import type { Request, Response } from "express";

import { isRecord } from "../../utils/type-guards.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostMasterKey(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    if (deps.secretsStore.isInitialized()) {
      res.status(409).json({ error: { code: "already_initialized", message: "Master key is already set" } });
      return;
    }

    const body = req.body;
    const providedKey = isRecord(body) && typeof body.key === "string" && body.key ? body.key : null;
    const key = providedKey ?? randomBytes(32).toString("hex");

    try {
      const keyFile = path.join(deps.archiveDir, "master.key");
      await mkdir(deps.archiveDir, { recursive: true });
      await writeFile(keyFile, key, { encoding: "utf8", mode: 0o600 });
      await deps.secretsStore.initializeWithKey(key);
      res.json({ key });
    } catch (error) {
      res.status(500).json({ error: { code: "setup_error", message: String(error) } });
    }
  };
}
