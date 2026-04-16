import type { SecretsPort } from "../secrets/port.js";

import { fetchCodexModels } from "./model-list.js";

export interface CodexModelCatalogReader {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface ReadCodexModelCatalogOptions {
  limit?: number;
  includeHidden?: boolean;
}

export async function readCodexModelCatalog(
  deps: {
    controlPlane?: CodexModelCatalogReader;
    secretsStore?: Pick<SecretsPort, "get">;
  },
  options: ReadCodexModelCatalogOptions = {},
): Promise<unknown[]> {
  const limit = options.limit ?? 50;
  const includeHidden = options.includeHidden ?? true;
  let models: unknown[] | null = null;

  if (deps.controlPlane) {
    try {
      const result = (await deps.controlPlane.request("model/list", {
        limit,
        includeHidden,
      })) as { data?: unknown[] };
      models = Array.isArray(result.data) ? result.data : [];
    } catch {
      models = null;
    }
  }

  if (models !== null) {
    return models;
  }

  const apiKey = deps.secretsStore?.get("OPENAI_API_KEY") ?? undefined;
  return fetchCodexModels(apiKey);
}
