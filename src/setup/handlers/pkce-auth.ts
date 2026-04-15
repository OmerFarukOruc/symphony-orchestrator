import type { Request, Response } from "express";
import { toErrorString } from "../../utils/type-guards.js";

import { SetupServiceError, resolveSetupService, type SetupService } from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostPkceAuthStart(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (_req: Request, res: Response) => {
    try {
      res.json(await service.startPkceAuth());
    } catch (error) {
      if (error instanceof SetupServiceError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      res.status(500).json({ error: { code: "pkce_start_error", message: toErrorString(error) } });
    }
  };
}

export function handleGetPkceAuthStatus(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (_req: Request, res: Response) => {
    res.json(await service.getPkceAuthStatus());
  };
}

export function handlePostPkceAuthCancel(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (_req: Request, res: Response) => {
    res.json(await service.cancelPkceAuth());
  };
}
