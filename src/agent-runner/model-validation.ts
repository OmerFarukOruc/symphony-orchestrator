import type { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import type { RisolutoLogger } from "../core/types.js";
import { asRecord, asString } from "./helpers.js";

export async function fetchAvailableModels(
  connection: JsonRpcConnection,
  logger: RisolutoLogger,
): Promise<string[] | null> {
  try {
    const modelIds: string[] = [];
    let cursor: string | null = null;

    do {
      const result = await connection.request("model/list", cursor ? { cursor, limit: 100 } : { limit: 100 });
      const data = asRecord(result);
      const models = Array.isArray(data.data) ? data.data : data.models;
      if (!Array.isArray(models)) {
        return modelIds.length > 0 ? modelIds : null;
      }

      modelIds.push(...models.map((m) => asString(asRecord(m).id)).filter((id): id is string => id !== null));
      cursor = asString(data.nextCursor);
    } while (cursor);

    if (modelIds.length > 0) {
      return modelIds;
    }
    return [];
  } catch {
    // Older Codex versions may not support model/list — silently skip
    logger.warn("model/list unavailable — skipping model validation");
    return null;
  }
}
