/**
 * Utility helpers for the Symphony E2E lifecycle test.
 *
 * Every function is a pure building block — no phase logic lives here.
 * Phase orchestration uses these to interact with Linear, Symphony, and
 * the local filesystem.
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import net from "node:net";
import path from "node:path";

import type { E2EConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/**
 * Expand a value that may reference an environment variable.
 *
 * If `value` starts with `$`, strip the prefix and look up the
 * corresponding env var. Direct literal values pass through unchanged.
 *
 * @throws {TypeError} if the referenced env var is not set.
 */
export function resolveEnvValue(value: string): string {
  if (!value.startsWith("$")) {
    return value;
  }
  const envName = value.slice(1);
  const resolved = process.env[envName];
  if (resolved === undefined) {
    throw new TypeError(`Environment variable ${envName} is not set (referenced as ${value})`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

/**
 * Check whether a TCP port is available on the loopback interface.
 *
 * Creates a temporary server, attempts to bind, and immediately closes it.
 * Returns `true` when the port is free.
 */
export function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** Promise-based sleep. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// HTTP utilities
// ---------------------------------------------------------------------------

/**
 * Poll a URL until it responds with HTTP 200.
 *
 * @param url        - The URL to probe.
 * @param timeoutMs  - Maximum time to wait before throwing.
 * @param intervalMs - Delay between probes (default 500 ms).
 * @throws {Error} when the timeout is exceeded without a 200 response.
 */
export async function waitForHttp(url: string, timeoutMs: number, intervalMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet — retry after interval.
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }

  throw new Error(`waitForHttp: ${url} did not respond 200 within ${timeoutMs} ms`);
}

/**
 * Fetch JSON from a URL, throwing on non-2xx responses.
 *
 * Parses the response body as JSON and returns it. On non-2xx the
 * thrown error includes the status code and response text for diagnosis.
 */
export async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable>");
    throw new Error(`fetchJson ${response.status} ${response.statusText} — ${url}\n${body}`);
  }
  return response.json();
}

/**
 * Fetch with an AbortController-based timeout.
 *
 * Used for setup wizard steps and other calls where a hard upper bound
 * on wait time is required.
 */
export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

// ---------------------------------------------------------------------------
// Linear GraphQL
// ---------------------------------------------------------------------------

/**
 * Execute a GraphQL query against the Linear API.
 *
 * **CRITICAL**: Linear uses the raw API key in the Authorization header,
 * NOT the `Bearer {key}` scheme.
 *
 * @throws {Error} on non-200 HTTP status or GraphQL-level errors.
 */
export async function callLinearGraphQL(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable>");
    throw new Error(`Linear GraphQL ${response.status} ${response.statusText}\n${body}`);
  }

  const json = (await response.json()) as { errors?: Array<{ message: string }> };
  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((error) => error.message).join("; ");
    throw new Error(`Linear GraphQL errors: ${messages}`);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Workflow scaffold
// ---------------------------------------------------------------------------

/**
 * Generate the YAML content for WORKFLOW.e2e.md used during setup-mode testing.
 *
 * Key design choices:
 * - `project_slug: ""` — empty string triggers setup mode via Zod
 *   `z.string().min(1)` validation failure in the main Symphony config.
 * - `api_key: $LINEAR_API_KEY` — env-var expansion, never a literal secret.
 * - `repos: []` — intentionally empty; gets overwritten by the setup wizard
 *   repo-route step.
 *
 * NOTE: The E2E config uses `identifier_prefix` (snake_case) but the
 * Symphony setup wizard API POST body uses `identifierPrefix` (camelCase).
 */
export function generateWorkflowScaffold(config: E2EConfig): string {
  const lines = [
    "# Auto-generated E2E test workflow — do not edit manually.",
    "",
    "tracker:",
    "  kind: linear",
    "  api_key: $LINEAR_API_KEY",
    '  project_slug: ""',
    "",
    "codex:",
    `  model: ${config.codex.model}`,
    `  reasoning_effort: ${config.codex.reasoning_effort}`,
    "  auth:",
    `    mode: ${config.codex.auth_mode}`,
    `    source_home: ${config.codex.source_home}`,
    "",
    "server:",
    `  port: ${config.server.port}`,
    "",
    "repos: []",
    "",
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

/**
 * Spawn the Symphony server process.
 *
 * Runs `node dist/cli/index.js {workflowPath} --port {port}` with the
 * current environment inherited. Stdout and stderr are piped to log files
 * inside `reportDir`.
 */
export function spawnSymphony(port: number, workflowPath: string, reportDir: string): ReturnType<typeof spawn> {
  const stdoutLog = createWriteStream(path.join(reportDir, "symphony-stdout.log"));
  const stderrLog = createWriteStream(path.join(reportDir, "symphony-stderr.log"));

  const child = spawn("node", ["dist/cli/index.js", workflowPath, "--port", String(port)], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.pipe(stdoutLog);
  child.stderr?.pipe(stderrLog);

  return child;
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/** Extract a human-readable message from an unknown error value. */
export function errorMsg(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/**
 * Gracefully stop a child process: SIGTERM, then SIGKILL after a timeout.
 * Resolves once the process has exited.
 */
export async function stopProcess(child: ChildProcess, gracefulMs: number): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      child.once("exit", () => resolve(true));
    }),
    sleep(gracefulMs).then(() => false),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    });
  }
}
