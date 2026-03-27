import type { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import type { SymphonyLogger } from "../core/types.js";
import { asRecord, asString } from "./helpers.js";

export async function fetchAvailableModels(
  connection: JsonRpcConnection,
  logger: SymphonyLogger,
): Promise<string[] | null> {
  try {
    const result = await connection.request("model/list", {});
    const data = asRecord(result);
    const models = data.models;
    if (Array.isArray(models)) {
      return models.map((m) => asString(asRecord(m).id)).filter((id): id is string => id !== null);
    }
    return null;
  } catch {
    // Older Codex versions may not support model/list — silently skip
    logger.warn("model/list unavailable — skipping model validation");
    return null;
  }
}
