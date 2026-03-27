import type { SymphonyLogger } from "../core/types.js";
import { asRecord } from "./helpers.js";
import { toErrorString } from "../utils/type-guards.js";

/** Minimal interface for the JSON-RPC request method used by preflight. */
export interface PreflightConnection {
  request(method: string, params: unknown): Promise<unknown>;
}

export interface PreflightResult {
  passed: boolean;
  failedCommand?: string;
  output?: string;
}

export async function runPreflight(
  connection: PreflightConnection,
  commands: string[],
  logger: SymphonyLogger,
): Promise<PreflightResult> {
  if (commands.length === 0) {
    return { passed: true };
  }

  for (const command of commands) {
    try {
      const result = await connection.request("command/exec", { command });
      const data = asRecord(result);
      const exitCode = typeof data.exitCode === "number" ? data.exitCode : -1;
      if (exitCode !== 0) {
        logger.warn({ command, exitCode }, "preflight command failed");
        return {
          passed: false,
          failedCommand: command,
          output: typeof data.output === "string" ? data.output : undefined,
        };
      }
    } catch (error) {
      logger.warn({ command, error: toErrorString(error) }, "preflight command/exec request failed");
      return {
        passed: false,
        failedCommand: command,
      };
    }
  }

  return { passed: true };
}
