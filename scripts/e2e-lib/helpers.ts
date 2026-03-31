/**
 * Utility helpers for the Risoluto E2E lifecycle test.
 *
 * Every function is a pure building block — no phase logic lives here.
 * Phase orchestration uses these to interact with Linear, Risoluto, and
 * the local filesystem.
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import net from "node:net";
import path from "node:path";

import type { E2EConfig, RunContext } from "./types.js";

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
// Overlay payload
// ---------------------------------------------------------------------------

/**
 * Build the config overlay map that pre-seeds Risoluto with all values needed
 * to bypass setup mode and dispatch immediately.
 *
 * Key design choices:
 * - `tracker.project_slug` is the real slug — bypasses setup mode validation.
 * - `tracker.api_key` is stored as a literal resolved value at runtime.
 * - `repos` is pre-populated so the orchestrator routes issues without the wizard.
 * - Secrets (LINEAR_API_KEY, GITHUB_TOKEN) are resolved from env and written to
 *   the overlay; the master.key file and secrets store are seeded separately.
 */
export function buildOverlayPayload(config: E2EConfig): Record<string, unknown> {
  const { test_repo: repo } = config.github;
  return {
    tracker: {
      kind: "linear",
      api_key: "$LINEAR_API_KEY",
      project_slug: config.linear.project_slug,
    },
    codex: {
      command: "codex app-server",
      model: config.codex.model,
      reasoning_effort: config.codex.reasoning_effort,
      approval_policy: "never",
      thread_sandbox: "danger-full-access",
      turn_sandbox_policy: { type: "dangerFullAccess" },
      auth: {
        mode: config.codex.auth_mode,
        source_home: config.codex.source_home,
      },
    },
    polling: { interval_ms: 10000 },
    agent: {
      max_concurrent_agents: 1,
      max_turns: 20,
      success_state: "Done",
    },
    workspace: {
      root: "../risoluto-e2e-workspaces",
      strategy: "directory",
    },
    server: { port: config.server.port },
    repos: [
      {
        repo_url: repo.url,
        default_branch: repo.branch,
        identifier_prefix: repo.identifier_prefix,
        github_owner: repo.owner,
        github_repo: repo.repo,
        github_token_env: "GITHUB_TOKEN",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

/**
 * Build the extra environment variables needed to spawn Risoluto.
 * Resolves credential references from the E2E config and includes the
 * MASTER_KEY when available. Used by both initial startup and restart.
 */
export function buildRisolutoEnv(ctx: RunContext): Record<string, string> | undefined {
  const resolvedLinearKey = resolveEnvValue(ctx.config.linear.api_key);
  const resolvedGithubToken = resolveEnvValue(ctx.config.github.token);
  return ctx.masterKey
    ? { MASTER_KEY: ctx.masterKey, LINEAR_API_KEY: resolvedLinearKey, GITHUB_TOKEN: resolvedGithubToken }
    : undefined;
}

/**
 * Spawn the Risoluto server process.
 *
 * Runs `node dist/cli/index.js --data-dir {dataDir} --port {port}` with the
 * current environment inherited plus any extra env vars (e.g. MASTER_KEY).
 * Risoluto reads the pre-seeded overlay from `<dataDir>/config/overlay.yaml`
 * on startup, bypassing setup mode without a positional workflow file arg.
 * Stdout and stderr are piped to log files inside `reportDir`.
 */
export function spawnRisoluto(
  port: number,
  dataDir: string,
  reportDir: string,
  extraEnv?: Record<string, string>,
): ReturnType<typeof spawn> {
  const stdoutLog = createWriteStream(path.join(reportDir, "risoluto-stdout.log"), { flags: "a" });
  const stderrLog = createWriteStream(path.join(reportDir, "risoluto-stderr.log"), { flags: "a" });

  const child = spawn("node", ["dist/cli/index.js", "--data-dir", dataDir, "--port", String(port)], {
    env: { ...process.env, ...extraEnv },
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
