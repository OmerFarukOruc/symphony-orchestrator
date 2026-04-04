import type { Request, Response } from "express";

import { isRecord } from "../../utils/type-guards.js";
import type { SetupApiDeps } from "./shared.js";

interface ParsedProviderConfig {
  baseUrl: string | null;
  name: string | null;
  supplied: boolean;
}

function trimOptionalNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseProviderConfig(body: unknown): ParsedProviderConfig {
  const providerBody = isRecord(body) && isRecord(body.provider) ? body.provider : null;
  return {
    supplied: providerBody !== null,
    name: trimOptionalNonEmptyString(providerBody?.name),
    baseUrl: trimOptionalNonEmptyString(providerBody?.baseUrl),
  };
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.at(end - 1) === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function getValidationUrl(baseUrl: string | null): string {
  return baseUrl ? `${stripTrailingSlashes(baseUrl)}/models` : "https://api.openai.com/v1/models";
}

async function validateOpenaiKey(key: string, validationUrl: string): Promise<boolean> {
  try {
    const openaiResponse = await fetch(validationUrl, {
      headers: { authorization: `Bearer ${key}` },
    });
    return openaiResponse.ok;
  } catch {
    return false;
  }
}

async function persistOpenaiKeyConfig(deps: SetupApiDeps, key: string, provider: ParsedProviderConfig): Promise<void> {
  await Promise.all([
    deps.secretsStore.set("OPENAI_API_KEY", key),
    deps.configOverlayStore.set("codex.auth.mode", "api_key"),
  ]);

  await deps.configOverlayStore.delete("codex.provider");
  if (!provider.baseUrl) {
    return;
  }

  const operations: Promise<unknown>[] = [
    deps.configOverlayStore.set("codex.provider.base_url", provider.baseUrl),
    deps.configOverlayStore.set("codex.provider.env_key", "OPENAI_API_KEY"),
    deps.configOverlayStore.set("codex.provider.wire_api", "responses"),
  ];
  if (provider.name) {
    operations.push(deps.configOverlayStore.set("codex.provider.name", provider.name));
  }
  await Promise.all(operations);
}

export function handlePostOpenaiKey(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    const body = req.body;
    const key = trimOptionalNonEmptyString(isRecord(body) ? body.key : null);
    if (!key) {
      res.status(400).json({ error: { code: "missing_key", message: "key is required" } });
      return;
    }

    const provider = parseProviderConfig(body);

    if (provider.supplied && !provider.baseUrl) {
      res.status(400).json({
        error: {
          code: "missing_provider_base_url",
          message: "provider.baseUrl is required when provider is configured",
        },
      });
      return;
    }

    const valid = await validateOpenaiKey(key, getValidationUrl(provider.baseUrl));

    if (valid) {
      await persistOpenaiKeyConfig(deps, key, provider);
    }

    res.json({ valid });
  };
}
