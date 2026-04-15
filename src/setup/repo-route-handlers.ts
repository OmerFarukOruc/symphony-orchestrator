import type { Request, Response } from "express";

import { isRecord, toErrorString } from "../utils/type-guards.js";
import { SetupServiceError, resolveSetupService, type SetupService } from "./setup-service.js";
import type { SetupApiDeps } from "./handlers/shared.js";

function parseRepoRouteBody(body: unknown): {
  repoUrl: string | null;
  defaultBranch: string | null;
  identifierPrefix: string | null;
  label: string | null;
} {
  if (!isRecord(body)) {
    return { repoUrl: null, defaultBranch: null, identifierPrefix: null, label: null };
  }

  return {
    repoUrl: typeof body.repoUrl === "string" ? body.repoUrl : null,
    defaultBranch: typeof body.defaultBranch === "string" ? body.defaultBranch : null,
    identifierPrefix: typeof body.identifierPrefix === "string" ? body.identifierPrefix : null,
    label: typeof body.label === "string" ? body.label : null,
  };
}

function respondWithSetupError(res: Response, error: unknown): void {
  if (error instanceof SetupServiceError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  res.status(500).json({
    error: {
      code: "repo_route_error",
      message: toErrorString(error),
    },
  });
}

export function handlePostRepoRoute(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (req: Request, res: Response) => {
    try {
      res.json(await service.saveRepoRoute(parseRepoRouteBody(req.body)));
    } catch (error) {
      respondWithSetupError(res, error);
    }
  };
}

export function handleGetRepoRoutes(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return (_req: Request, res: Response) => {
    res.json(service.getRepoRoutes());
  };
}

export function handleDeleteRepoRoute(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (req: Request, res: Response) => {
    const rawIndex = Array.isArray(req.params.index) ? req.params.index[0] : req.params.index;
    const index = rawIndex !== undefined && /^\d+$/.test(rawIndex) ? Number(rawIndex) : Number.NaN;

    try {
      res.json(await service.deleteRepoRoute(index));
    } catch (error) {
      respondWithSetupError(res, error);
    }
  };
}
