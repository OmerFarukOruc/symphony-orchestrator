import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { RisolutoLogger } from "../core/types.js";
import type { TrackerToolProvider } from "../tracker/tool-provider.js";

/** Maximum bytes of stderr to buffer during startup for diagnostics. */
const MAX_STDERR_BUFFER = 4096;

/** Error thrown when container startup readiness times out. */
export class StartupTimeoutError extends Error {
  readonly stderrOutput: string;
  constructor(timeoutMs: number, stderrOutput: string) {
    const hint = stderrOutput
      ? ` — captured stderr:\n${stderrOutput}`
      : " — no stderr output captured (container may have produced no output)";
    super(`startup readiness timed out after ${timeoutMs}ms${hint}`);
    this.name = "StartupTimeoutError";
    this.stderrOutput = stderrOutput;
  }
}

export interface StartupResult {
  /** Any stderr output captured during startup (for diagnostics). */
  stderrOutput: string;
}

export function waitForStartup(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<StartupResult> {
  if (timeoutMs <= 0) {
    return Promise.resolve({ stderrOutput: "" });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;

    const collectStderr = () => {
      const combined = Buffer.concat(stderrChunks).toString("utf8").trim();
      return combined.slice(0, MAX_STDERR_BUFFER);
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onStderrData = (chunk: Buffer) => {
      if (stderrBytes < MAX_STDERR_BUFFER) {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    };

    const onData = () => settle(() => resolve({ stderrOutput: collectStderr() }));
    const onExit = (code: number | null) =>
      settle(() => reject(new Error(`child exited with code ${code} before startup readiness`)));
    const onAbort = () => settle(() => reject(new Error("startup readiness interrupted")));
    const timer = setTimeout(
      () => settle(() => reject(new StartupTimeoutError(timeoutMs, collectStderr()))),
      timeoutMs,
    );

    const cleanup = () => {
      child.stdout.removeListener("data", onData);
      child.stderr.removeListener("data", onStderrData);
      child.stderr.removeListener("data", onData);
      child.removeListener("exit", onExit);
      signal.removeEventListener("abort", onAbort);
      clearTimeout(timer);
    };

    child.stderr.on("data", onStderrData);
    child.stdout.once("data", onData);
    child.stderr.once("data", onData);
    child.once("exit", onExit);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const TOOL_SCHEMAS: Record<string, object> = {
  linear_graphql: {
    name: "linear_graphql",
    description: "Run exactly one GraphQL operation against Linear.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "A single GraphQL query, mutation, or subscription document." },
        variables: {
          type: "object",
          additionalProperties: true,
          description: "Optional GraphQL variables for the document.",
        },
      },
      required: ["query"],
    },
  },
  github_api: {
    name: "github_api",
    description: "Read pull request status or add a pull request comment in GitHub.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["add_pr_comment", "get_pr_status"] },
        owner: { type: "string" },
        repo: { type: "string" },
        pullNumber: { type: "number" },
        body: { type: "string" },
      },
      required: ["action", "owner", "repo", "pullNumber"],
    },
  },
};

/**
 * Build the dynamic tools list for Codex `thread/start`.
 *
 * Includes all tools declared by the tracker provider plus the `github_api`
 * tool (always present as a non-tracker tool).
 */
export function buildDynamicTools(trackerToolProvider: TrackerToolProvider, logger: RisolutoLogger): object[] {
  const allNames = [...trackerToolProvider.toolNames, "github_api"];
  const unknownNames = allNames.filter((name) => TOOL_SCHEMAS[name] === undefined);
  if (unknownNames.length > 0) {
    logger.warn({ toolNames: unknownNames }, "tracker tool provider declared tools without schemas");
  }
  return allNames.flatMap((name) => {
    const schema = TOOL_SCHEMAS[name];
    return schema ? [schema] : [];
  });
}
