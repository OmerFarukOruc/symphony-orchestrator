import type { Request, Response } from "express";

import { isRecord, toErrorString } from "../utils/type-guards.js";
import { SetupServiceError, resolveSetupService, type SetupService } from "./setup-service.js";
import type { SetupApiDeps } from "./handlers/shared.js";

export { fetchDefaultBranch, parseOwnerRepo, resolveToken } from "./setup-service.js";

export function handleDetectDefaultBranch(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (req: Request, res: Response) => {
    const body = req.body;
    const repoUrl = isRecord(body) && typeof body.repoUrl === "string" ? body.repoUrl : null;

    try {
      res.json(await service.detectDefaultBranch(repoUrl));
    } catch (error) {
      if (error instanceof SetupServiceError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }

      res.status(500).json({
        error: {
          code: "default_branch_detection_error",
          message: toErrorString(error),
        },
      });
    }
  };
}
