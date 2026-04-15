import type { Request, Response } from "express";

import { resolveSetupService, type SetupService } from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

export function handleGetStatus(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return (_req: Request, res: Response) => {
    res.json(service.getStatus());
  };
}
