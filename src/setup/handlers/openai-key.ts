import type { Request, Response } from "express";

import { isRecord, toErrorString } from "../../utils/type-guards.js";
import {
  SetupServiceError,
  resolveSetupService,
  trimOptionalNonEmptyString,
  type SetupProviderConfig,
  type SetupService,
} from "../setup-service.js";
import type { SetupApiDeps } from "./shared.js";

function parseProviderConfig(body: unknown): SetupProviderConfig {
  const providerBody = isRecord(body) && isRecord(body.provider) ? body.provider : null;
  return {
    supplied: providerBody !== null,
    name: trimOptionalNonEmptyString(providerBody?.name),
    baseUrl: trimOptionalNonEmptyString(providerBody?.baseUrl),
  };
}

export function handlePostOpenaiKey(deps: SetupApiDeps | SetupService) {
  const service = resolveSetupService(deps);
  return async (req: Request, res: Response) => {
    const body = req.body;
    const key = trimOptionalNonEmptyString(isRecord(body) ? body.key : null);
    if (!key) {
      res.status(400).json({ error: { code: "missing_key", message: "key is required" } });
      return;
    }

    const provider = parseProviderConfig(body);

    try {
      res.json(await service.saveOpenaiKey(key, provider));
    } catch (error) {
      if (error instanceof SetupServiceError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      res.status(500).json({ error: { code: "openai_save_error", message: toErrorString(error) } });
    }
  };
}
