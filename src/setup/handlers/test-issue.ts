import type { Request, Response } from "express";

import { getErrorMessage } from "../../utils/type-guards.js";
import { SetupServiceError, resolveSetupService, type SetupService } from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostCreateTestIssue(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (_req: Request, res: Response) => {
    try {
      res.json(await service.createTestIssue());
    } catch (error) {
      if (error instanceof SetupServiceError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      const message = getErrorMessage(error, "Failed to create test issue");
      res.status(502).json({ error: { code: "linear_api_error", message } });
    }
  };
}
