import type { Request, Response } from "express";

import { isRecord } from "../../utils/type-guards.js";
import { resolveSetupService, type SetupService } from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostGithubToken(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (req: Request, res: Response) => {
    const body = req.body;
    const token = isRecord(body) && typeof body.token === "string" ? body.token : null;
    if (!token) {
      res.status(400).json({ error: { code: "missing_token", message: "token is required" } });
      return;
    }

    res.json(await service.saveGithubToken(token));
  };
}
