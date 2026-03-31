import type { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import type { RisolutoLogger } from "../core/types.js";
import { toErrorString } from "../utils/type-guards.js";

export async function compactThread(
  connection: JsonRpcConnection,
  threadId: string,
  logger: RisolutoLogger,
): Promise<boolean> {
  try {
    await connection.request("thread/compact/start", { threadId });
    logger.info({ threadId }, "thread compacted successfully");
    return true;
  } catch (error) {
    logger.warn({ error: toErrorString(error), threadId }, "thread/compact/start failed");
    return false;
  }
}
