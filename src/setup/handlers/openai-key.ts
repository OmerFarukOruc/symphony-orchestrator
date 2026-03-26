import type { Request, Response } from "express";

import { isRecord } from "../../utils/type-guards.js";
import type { SetupApiDeps } from "./shared.js";

export function handlePostOpenaiKey(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    const body = req.body;
    const key = isRecord(body) && typeof body.key === "string" ? body.key : null;
    if (!key) {
      res.status(400).json({ error: { code: "missing_key", message: "key is required" } });
      return;
    }

    let valid: boolean;
    try {
      const openaiResponse = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${key}` },
      });
      valid = openaiResponse.ok;
    } catch {
      valid = false;
    }

    if (valid) {
      const overlay = deps.configOverlayStore.toMap();
      const codex = isRecord(overlay.codex) ? overlay.codex : undefined;
      const provider = isRecord(codex?.provider) ? codex.provider : undefined;
      const hasCustomProvider = !!provider?.name;

      const operations: Promise<unknown>[] = [
        deps.secretsStore.set("OPENAI_API_KEY", key),
        deps.configOverlayStore.set("codex.auth.mode", "api_key"),
      ];

      if (!hasCustomProvider) {
        operations.push(
          deps.configOverlayStore.set("codex.provider.name", "CLIProxyAPI"),
          deps.configOverlayStore.set("codex.provider.base_url", "http://localhost:8317/v1"),
          deps.configOverlayStore.set("codex.provider.env_key", "OPENAI_API_KEY"),
          deps.configOverlayStore.set("codex.provider.wire_api", "responses"),
        );
      }

      await Promise.all(operations);
    }

    res.json({ valid });
  };
}
