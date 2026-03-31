import type { Request, Response } from "express";

import { isRecord } from "../../utils/type-guards.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostGithubToken(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    const body = req.body;
    const token = isRecord(body) && typeof body.token === "string" ? body.token : null;
    if (!token) {
      res.status(400).json({ error: { code: "missing_token", message: "token is required" } });
      return;
    }

    let valid: boolean;
    try {
      const ghResponse = await fetch("https://api.github.com/user", {
        headers: { authorization: `token ${token}`, "user-agent": "Risoluto" },
      });
      valid = ghResponse.ok;
    } catch {
      valid = false;
    }

    if (valid) {
      await deps.secretsStore.set("GITHUB_TOKEN", token);
    }

    res.json({ valid });
  };
}
