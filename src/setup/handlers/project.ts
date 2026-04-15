import type { Request, Response } from "express";

import { getErrorMessage, isRecord } from "../../utils/type-guards.js";
import { SetupServiceError, resolveSetupService, type SetupService } from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

function parseProjectName(body: unknown): string | null {
  if (!isRecord(body) || typeof body.name !== "string") return null;
  const name = body.name.trim();
  return name || null;
}

export function handlePostCreateProject(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (req: Request, res: Response) => {
    const name = parseProjectName(req.body);
    if (!name) {
      res.status(400).json({ error: { code: "missing_name", message: "Project name is required" } });
      return;
    }

    try {
      res.json(await service.createProject(name));
    } catch (error) {
      if (error instanceof SetupServiceError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      const message = getErrorMessage(error, "Failed to create project");
      res.status(502).json({ error: { code: "linear_api_error", message } });
    }
  };
}
