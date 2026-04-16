/**
 * Startup phases (0–2) for the Risoluto E2E lifecycle test.
 *
 * Phase 0 — preflight:       validates credentials, tools, ports, and build
 * Phase 1 — clean-slate:     removes leftover `.risoluto` directory
 * Phase 2 — start-risoluto:  spawns the server in normal mode (setup bypassed)
 */

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import YAML from "yaml";

import type { RunContext, PhaseResult } from "./types.js";
import {
  resolveEnvValue,
  checkPortAvailable,
  waitForHttp,
  buildOverlayPayload,
  spawnRisoluto,
  buildRisolutoEnv,
  fetchJson,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Expand a leading `~` to the user's home directory. */
export function expandTilde(filePath: string): string {
  if (filePath === "~" || filePath.startsWith("~/")) {
    return path.join(homedir(), filePath.slice(1));
  }
  return filePath;
}

/** Log a phase event to the console and JSONL event stream. */
function logEvent(
  ctx: RunContext,
  prefix: string,
  name: string,
  passed: boolean,
  extra?: Record<string, unknown>,
  detail?: string,
): void {
  const status = passed ? "pass" : "FAIL";
  const suffix = detail ? `  (${detail})` : "";
  console.log(`  [${prefix}] ${name}: ${status}${suffix}`);
  ctx.events.write({ phase: prefix, name, status, detail: detail ?? null, ...extra });
}

/** Log a preflight check result. */
function logCheck(ctx: RunContext, phase: string, name: string, passed: boolean, detail?: string): void {
  logEvent(ctx, phase, name, passed, { check: name }, detail);
}

// ---------------------------------------------------------------------------
// Phase 0 — Preflight
// ---------------------------------------------------------------------------

/**
 * Validate all preconditions before launching Risoluto.
 *
 * Checks credentials, CLI tools, port availability, repo reachability,
 * and optionally runs the build step.
 */
export async function preflight(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const { config } = ctx;
  let checkCount = 0;

  const fail = (message: string): PhaseResult => ({
    phase: "preflight",
    status: "fail",
    durationMs: Date.now() - start,
    error: { message },
    data: { checks: checkCount },
  });

  // 1. Linear API key
  try {
    resolveEnvValue(config.linear.api_key);
    checkCount++;
    logCheck(ctx, "preflight", "LINEAR_API_KEY resolved", true);
  } catch {
    logCheck(ctx, "preflight", "LINEAR_API_KEY resolved", false);
    return fail("LINEAR_API_KEY not resolved");
  }

  // 2. GitHub token
  try {
    resolveEnvValue(config.github.token);
    checkCount++;
    logCheck(ctx, "preflight", "GITHUB_TOKEN resolved", true);
  } catch {
    logCheck(ctx, "preflight", "GITHUB_TOKEN resolved", false);
    return fail("GITHUB_TOKEN not resolved");
  }

  // 3. Codex auth — auth.json is only required in openai_login mode;
  // api_key mode relies on the OpenAI key resolved from the runtime config.
  if (config.codex.auth_mode === "openai_login") {
    const resolvedSourceHome = expandTilde(config.codex.source_home);
    const authJsonPath = path.join(resolvedSourceHome, "auth.json");
    if (existsSync(authJsonPath)) {
      checkCount++;
      logCheck(ctx, "preflight", "Codex auth ready", true, authJsonPath);
    } else {
      logCheck(ctx, "preflight", "Codex auth ready", false, authJsonPath);
      return fail(`Codex auth.json not found at ${authJsonPath}`);
    }
  } else {
    checkCount++;
    logCheck(ctx, "preflight", "Codex auth ready", true, "api_key mode");
  }

  // 4. Docker running
  try {
    execFileSync("docker", ["info"], { timeout: 2000, stdio: "ignore" });
    checkCount++;
    logCheck(ctx, "preflight", "Docker running", true);
  } catch {
    logCheck(ctx, "preflight", "Docker running", false);
    return fail("Docker daemon not reachable");
  }

  // 5. gh CLI
  try {
    execFileSync("gh", ["--version"], { timeout: 2000, stdio: "ignore" });
    checkCount++;
    logCheck(ctx, "preflight", "gh CLI available", true);
  } catch {
    logCheck(ctx, "preflight", "gh CLI available", false);
    return fail("gh CLI not installed (needed for PR verification)");
  }

  // 6. Port available
  const port = ctx.risolutoPort;
  const portFree = await checkPortAvailable(port);
  if (portFree) {
    checkCount++;
    logCheck(ctx, "preflight", "Port available", true, String(port));
  } else {
    logCheck(ctx, "preflight", "Port available", false, String(port));
    return fail(`Port ${port} in use`);
  }

  // 7. Test repo reachable
  const repoUrl = config.github.test_repo.url;
  try {
    execFileSync("git", ["ls-remote", repoUrl], { timeout: 10_000, stdio: "ignore" });
    checkCount++;
    logCheck(ctx, "preflight", "Test repo reachable", true, repoUrl);
  } catch {
    logCheck(ctx, "preflight", "Test repo reachable", false, repoUrl);
    return fail(`Cannot reach ${repoUrl}`);
  }

  // 8. Build (unless skipped)
  if (ctx.skipBuild) {
    logCheck(ctx, "preflight", "Build succeeds", true, "skipped");
    checkCount++;
  } else {
    try {
      execFileSync("pnpm", ["run", "build"], { timeout: 60_000, stdio: "ignore" });
      checkCount++;
      logCheck(ctx, "preflight", "Build succeeds", true);
    } catch {
      logCheck(ctx, "preflight", "Build succeeds", false);
      return fail("Build failed");
    }
  }

  return {
    phase: "preflight",
    status: "pass",
    durationMs: Date.now() - start,
    data: { checks: checkCount },
  };
}

// ---------------------------------------------------------------------------
// Phase 1 — Clean Slate
// ---------------------------------------------------------------------------

/**
 * Remove leftover `.risoluto` directory so the server starts fresh.
 */
export async function cleanSlate(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();

  await Promise.all([
    rm(".risoluto", { recursive: true, force: true }),
    rm("../risoluto-e2e-workspaces", { recursive: true, force: true }),
  ]);

  ctx.events.write({ phase: "clean-slate", action: "rm .risoluto + workspaces" });
  console.log("  [clean-slate] removed .risoluto directory and workspace root");

  return {
    phase: "clean-slate",
    status: "pass",
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Start Risoluto (normal mode — setup bypassed)
// ---------------------------------------------------------------------------

/** Shape of GET /api/v1/state used for verifying the orchestrator is alive. */
interface StateResponse {
  generated_at: string;
  counts: { running: number; retrying: number };
}

/**
 * Spawn the Risoluto server in **normal mode**, bypassing setup entirely.
 *
 * How setup is bypassed:
 * - Config overlay is pre-seeded to `<archiveDir>/config/overlay.yaml` BEFORE
 *   Risoluto starts. The overlay contains the real `project_slug` so
 *   `validateDispatch()` passes without triggering setup mode.
 * - A random `MASTER_KEY` is written to `<archiveDir>/master.key` so
 *   `SecretsStore.start()` succeeds on the first try (no MASTER_KEY env var needed).
 * - `repos` are pre-populated in the overlay so routing works immediately.
 * - Risoluto starts with `--data-dir <dataDir>` (no positional workflow file arg).
 */
export async function startRisoluto(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const { config } = ctx;

  // 1. Determine the dataDir — a subdirectory of reportDir keeps each run isolated.
  //    The CLI computes archiveDir = path.join(dataDir, "archives") internally, so
  //    config files must be written there, not directly under dataDir.
  const dataDir = path.join(ctx.reportDir, "risoluto-data");
  const archiveDir = path.join(dataDir, "archives");
  const configDir = path.join(archiveDir, "config");
  await mkdir(configDir, { recursive: true });

  // 2. Generate a MASTER_KEY and write it to master.key so SecretsStore boots
  //    without requiring the MASTER_KEY environment variable.
  const masterKey = randomBytes(32).toString("hex");
  ctx.masterKey = masterKey;
  await writeFile(path.join(archiveDir, "master.key"), masterKey, "utf-8");

  // 3. Write the overlay config to <archiveDir>/config/overlay.yaml BEFORE spawning.
  //    ConfigOverlayStore reads this path on startup.
  const overlayPayload = buildOverlayPayload(config);
  const overlayYaml = YAML.stringify(overlayPayload);
  const overlayPath = path.join(configDir, "overlay.yaml");
  await writeFile(overlayPath, overlayYaml, "utf-8");

  ctx.events.write({ phase: "start-risoluto", step: "overlay-seeded", path: overlayPath });
  console.log(`  [start-risoluto] seeded overlay at ${overlayPath}`);

  // 4. Spawn Risoluto with --data-dir pointing at dataDir. No positional workflow
  //    file arg — Risoluto reads config from the pre-seeded overlay.
  ctx.risolutoProcess = spawnRisoluto(ctx.risolutoPort, dataDir, ctx.reportDir, buildRisolutoEnv(ctx));

  ctx.events.write({ phase: "start-risoluto", step: "process-spawned", pid: ctx.risolutoProcess.pid ?? null });
  console.log(`  [start-risoluto] spawned Risoluto (pid: ${ctx.risolutoProcess.pid ?? "unknown"})`);

  // 5. Wait for HTTP readiness — use /api/v1/state since that only returns 200
  //    when the orchestrator has started (not in setup mode)
  const stateUrl = `${ctx.baseUrl}/api/v1/state`;
  await waitForHttp(stateUrl, config.timeouts.risoluto_startup_ms);

  ctx.events.write({ phase: "start-risoluto", step: "http-ready" });
  console.log("  [start-risoluto] HTTP server is ready");

  // 6. Verify orchestrator is alive (normal mode, not setup mode)
  const state = (await fetchJson(stateUrl)) as StateResponse;
  if (!state.generated_at) {
    return {
      phase: "start-risoluto",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: "State endpoint returned but missing generated_at — orchestrator may not be running" },
    };
  }

  ctx.events.write({ phase: "start-risoluto", step: "normal-mode-verified", generatedAt: state.generated_at });
  console.log("  [start-risoluto] orchestrator running in normal mode");

  return {
    phase: "start-risoluto",
    status: "pass",
    durationMs: Date.now() - start,
  };
}
