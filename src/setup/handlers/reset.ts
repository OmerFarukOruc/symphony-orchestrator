import type { Request, Response } from "express";

import { getErrorMessage } from "../../utils/type-guards.js";
import { resolveSetupService, type SetupService } from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostReset(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (_req: Request, res: Response) => {
    try {
      res.json(await service.reset());
    } catch (error) {
      const message = getErrorMessage(error, "Failed to reset configuration");
      res.status(500).json({ error: { code: "reset_failed", message } });
    }
  };
}
