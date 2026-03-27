import { spawn } from "node:child_process";

import { getAvailableModelIds } from "../core/model-pricing.js";

export interface CodexModelEntry {
  id: string;
  displayName: string;
  isDefault: boolean;
}

interface ModelListRpcResult {
  data: Array<{
    id: string;
    displayName: string;
    hidden: boolean;
    isDefault: boolean;
  }>;
}

let cached: CodexModelEntry[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
const QUERY_TIMEOUT_MS = 15_000;

/**
 * Fetches the list of models available to Codex by spawning
 * `codex app-server` and querying `model/list` via JSON-RPC.
 *
 * Results are cached for 5 minutes. Falls back to the static
 * pricing table if the Codex binary is unavailable or errors.
 */
export async function fetchCodexModels(apiKey?: string): Promise<CodexModelEntry[]> {
  if (cached && Date.now() < cacheExpiry) {
    return cached;
  }

  try {
    const result = await queryModelList(apiKey);
    cached = result;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  } catch {
    return getAvailableModelIds().map((id) => ({ id, displayName: id, isDefault: false }));
  }
}

function queryModelList(apiKey?: string): Promise<CodexModelEntry[]> {
  return new Promise((resolve, reject) => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (apiKey) {
      env.OPENAI_API_KEY = apiKey;
    }

    const child = spawn("codex", ["app-server"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("codex model/list timed out"));
      }
    }, QUERY_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };

    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let idx = buffer.indexOf("\n");
      while (idx >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) {
          handleLine(line);
        }
        idx = buffer.indexOf("\n");
      }
    });

    child.stdin.on("error", () => {
      /* Ignore EPIPE — Codex may exit before reading our request. */
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(error.code === "ENOENT" ? new Error("codex binary not found") : error);
      }
    });

    child.on("exit", (code) => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new Error(`codex exited with code ${String(code)} before responding`));
      }
    });

    function handleLine(line: string): void {
      if (settled) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "id" in parsed &&
        (parsed as { id: unknown }).id === 1 &&
        "result" in parsed
      ) {
        settled = true;
        cleanup();
        const result = (parsed as { result: ModelListRpcResult }).result;
        resolve(
          result.data
            .filter((m) => !m.hidden)
            .map((m) => ({ id: m.id, displayName: m.displayName, isDefault: m.isDefault })),
        );
      }
    }

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "model/list",
      params: { limit: 50, includeHidden: false },
    });
    child.stdin.write(request + "\n");
  });
}
