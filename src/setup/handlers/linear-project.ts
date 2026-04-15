import type { Request, Response } from "express";

import { isRecord, toErrorString } from "../../utils/type-guards.js";
import { SetupServiceError, resolveSetupService, type SetupService } from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

export function handleGetLinearProjects(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (_req: Request, res: Response) => {
    try {
      res.json(await service.getLinearProjects());
    } catch (error) {
      if (error instanceof SetupServiceError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      res.status(502).json({ error: { code: "linear_api_error", message: toErrorString(error) } });
    }
  };
}

export function handlePostLinearProject(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (req: Request, res: Response) => {
    const body = req.body;
    const slugId = isRecord(body) && typeof body.slugId === "string" ? body.slugId : null;
    if (!slugId) {
      res.status(400).json({ error: { code: "missing_slug_id", message: "slugId is required" } });
      return;
    }

    res.json(await service.selectLinearProject(slugId));
  };
}
