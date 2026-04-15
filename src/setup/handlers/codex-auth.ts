import type { Request, Response } from "express";

import { isRecord, toErrorString } from "../../utils/type-guards.js";
import { resolveSetupService, type SetupService } from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostCodexAuth(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
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
      res.json(await service.saveCodexAuth(authJson));
    } catch (error) {
      res.status(500).json({ error: { code: "save_error", message: toErrorString(error) } });
    }
  };
}
