/**
 * Startup phases (0–3) for the Symphony E2E lifecycle test.
 *
 * Phase 0 — preflight:       validates credentials, tools, ports, and build
 * Phase 1 — clean-slate:     removes leftover `.symphony` directory
 * Phase 2 — start-symphony:  spawns the server and waits for HTTP readiness
 * Phase 3 — setup-wizard:    drives the 5-step setup API to completion
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { RunContext, PhaseResult } from "./types.js";
import {
  resolveEnvValue,
  checkPortAvailable,
  waitForHttp,
  generateWorkflowScaffold,
  spawnSymphony,
  fetchWithTimeout,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Expand a leading `~` to the user's home directory. */
function expandTilde(filePath: string): string {
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

/** Log a setup wizard step result. */
function logStep(ctx: RunContext, stepNumber: number, name: string, passed: boolean, detail?: string): void {
  logEvent(ctx, "setup-wizard", name, passed, { step: stepNumber }, detail);
}

// ---------------------------------------------------------------------------
// Phase 0 — Preflight
// ---------------------------------------------------------------------------

/**
 * Validate all preconditions before launching Symphony.
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

  // 3. Codex auth.json
  const resolvedSourceHome = expandTilde(config.codex.source_home);
  const authJsonPath = path.join(resolvedSourceHome, "auth.json");
  if (existsSync(authJsonPath)) {
    checkCount++;
    logCheck(ctx, "preflight", "Codex auth.json exists", true, authJsonPath);
  } else {
    logCheck(ctx, "preflight", "Codex auth.json exists", false, authJsonPath);
    return fail(`Codex auth.json not found at ${authJsonPath}`);
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
  const port = ctx.symphonyPort;
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
  if (!ctx.skipBuild) {
    try {
      execFileSync("pnpm", ["run", "build"], { timeout: 60_000, stdio: "ignore" });
      checkCount++;
      logCheck(ctx, "preflight", "Build succeeds", true);
    } catch {
      logCheck(ctx, "preflight", "Build succeeds", false);
      return fail("Build failed");
    }
  } else {
    logCheck(ctx, "preflight", "Build succeeds", true, "skipped");
    checkCount++;
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
 * Remove leftover `.symphony` directory so the server starts fresh.
 */
export async function cleanSlate(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();

  await rm(".symphony", { recursive: true, force: true });

  ctx.events.write({ phase: "clean-slate", action: "rm .symphony" });
  console.log("  [clean-slate] removed .symphony directory");

  return {
    phase: "clean-slate",
    status: "pass",
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Start Symphony
// ---------------------------------------------------------------------------

/**
 * Spawn the Symphony server, wait for HTTP readiness, and verify setup mode.
 */
export async function startSymphony(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const { config } = ctx;

  // 1. Generate WORKFLOW.e2e.md
  const workflowContent = generateWorkflowScaffold(config);
  const workflowPath = path.join(ctx.reportDir, "WORKFLOW.e2e.md");
  await mkdir(ctx.reportDir, { recursive: true });
  await writeFile(workflowPath, workflowContent, "utf-8");

  ctx.events.write({ phase: "start-symphony", step: "workflow-generated", path: workflowPath });
  console.log(`  [start-symphony] generated workflow at ${workflowPath}`);

  // 2. Spawn Symphony
  ctx.symphonyProcess = spawnSymphony(ctx.symphonyPort, workflowPath, ctx.reportDir);

  ctx.events.write({ phase: "start-symphony", step: "process-spawned", pid: ctx.symphonyProcess.pid ?? null });
  console.log(`  [start-symphony] spawned Symphony (pid: ${ctx.symphonyProcess.pid ?? "unknown"})`);

  // 3. Wait for HTTP readiness
  const runtimeUrl = `${ctx.baseUrl}/api/v1/runtime`;
  await waitForHttp(runtimeUrl, config.timeouts.symphony_startup_ms);

  ctx.events.write({ phase: "start-symphony", step: "http-ready" });
  console.log("  [start-symphony] HTTP server is ready");

  // 4. Verify setup mode — master key should not be set yet
  const statusResponse = await fetchWithTimeout(`${ctx.baseUrl}/api/v1/setup/status`, { method: "GET" }, 10_000);

  if (!statusResponse.ok) {
    return {
      phase: "start-symphony",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: `Setup status returned ${statusResponse.status}` },
    };
  }

  const statusBody = (await statusResponse.json()) as {
    configured: boolean;
    steps: Record<string, { done: boolean }>;
  };

  // Master key must not be set yet on a fresh start
  if (statusBody.steps.masterKey?.done !== false) {
    return {
      phase: "start-symphony",
      status: "fail",
      durationMs: Date.now() - start,
      error: { message: "Expected masterKey.done === false on fresh start" },
    };
  }

  ctx.events.write({
    phase: "start-symphony",
    step: "setup-mode-verified",
    configured: statusBody.configured,
    masterKeyDone: statusBody.steps.masterKey?.done,
  });
  console.log("  [start-symphony] setup mode verified (masterKey not yet set)");

  return {
    phase: "start-symphony",
    status: "pass",
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 — Setup Wizard
// ---------------------------------------------------------------------------

const STEP_TIMEOUT_MS = 15_000;

/** POST JSON to a setup endpoint with a timeout. */
async function setupPost(baseUrl: string, endpoint: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithTimeout(
    `${baseUrl}${endpoint}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    STEP_TIMEOUT_MS,
  );
}

/** GET a setup endpoint with a timeout. */
async function setupGet(baseUrl: string, endpoint: string): Promise<Response> {
  return fetchWithTimeout(`${baseUrl}${endpoint}`, { method: "GET" }, STEP_TIMEOUT_MS);
}

/**
 * Drive the 5-step setup wizard to fully configure Symphony.
 *
 * Steps are executed sequentially. Linear project selection is last
 * because it triggers the orchestrator start.
 */
export async function setupWizard(ctx: RunContext): Promise<PhaseResult> {
  const start = Date.now();
  const { config, baseUrl } = ctx;

  const fail = (step: string, message: string): PhaseResult => ({
    phase: "setup-wizard",
    status: "fail",
    durationMs: Date.now() - start,
    error: { message: `Step "${step}" failed: ${message}` },
  });

  // ── Step 1: Master Key ──────────────────────────────────────────────────

  const masterKeyResponse = await setupPost(baseUrl, "/api/v1/setup/master-key", {});

  if (masterKeyResponse.status === 409) {
    // Already initialized — acceptable
    logStep(ctx, 1, "master-key", true, "already initialized (409)");
  } else if (!masterKeyResponse.ok) {
    const errorText = await masterKeyResponse.text().catch(() => "<unreadable>");
    logStep(ctx, 1, "master-key", false, `${masterKeyResponse.status}`);
    return fail("master-key", `HTTP ${masterKeyResponse.status}: ${errorText}`);
  } else {
    const masterKeyBody = (await masterKeyResponse.json()) as { key: string };
    logStep(ctx, 1, "master-key", true, `key length: ${masterKeyBody.key.length}`);
  }

  // ── Step 2: GitHub Token ────────────────────────────────────────────────

  const resolvedGithubToken = resolveEnvValue(config.github.token);
  const githubTokenResponse = await setupPost(baseUrl, "/api/v1/setup/github-token", {
    token: resolvedGithubToken,
  });

  if (!githubTokenResponse.ok) {
    const errorText = await githubTokenResponse.text().catch(() => "<unreadable>");
    logStep(ctx, 2, "github-token", false, `${githubTokenResponse.status}`);
    return fail("github-token", `HTTP ${githubTokenResponse.status}: ${errorText}`);
  }

  const githubTokenBody = (await githubTokenResponse.json()) as { valid: boolean };
  if (!githubTokenBody.valid) {
    logStep(ctx, 2, "github-token", false, "token validation failed");
    return fail("github-token", "GitHub API rejected the token (valid: false)");
  }

  logStep(ctx, 2, "github-token", true);

  // ── Step 3: Codex Auth ──────────────────────────────────────────────────

  const resolvedSourceHome = expandTilde(config.codex.source_home);
  const authJsonPath = path.join(resolvedSourceHome, "auth.json");
  const authJsonContents = await readFile(authJsonPath, "utf-8");

  const codexAuthResponse = await setupPost(baseUrl, "/api/v1/setup/codex-auth", {
    authJson: authJsonContents,
  });

  if (!codexAuthResponse.ok) {
    const errorText = await codexAuthResponse.text().catch(() => "<unreadable>");
    logStep(ctx, 3, "codex-auth", false, `${codexAuthResponse.status}`);
    return fail("codex-auth", `HTTP ${codexAuthResponse.status}: ${errorText}`);
  }

  const codexAuthBody = (await codexAuthResponse.json()) as { ok: boolean };
  if (!codexAuthBody.ok) {
    logStep(ctx, 3, "codex-auth", false, "ok: false");
    return fail("codex-auth", "Server returned ok: false");
  }

  logStep(ctx, 3, "codex-auth", true);

  // ── Step 4: Repo Route ──────────────────────────────────────────────────

  const repoRouteResponse = await setupPost(baseUrl, "/api/v1/setup/repo-route", {
    repoUrl: config.github.test_repo.url,
    defaultBranch: config.github.test_repo.branch,
    identifierPrefix: config.github.test_repo.identifier_prefix,
  });

  if (!repoRouteResponse.ok) {
    const errorText = await repoRouteResponse.text().catch(() => "<unreadable>");
    logStep(ctx, 4, "repo-route", false, `${repoRouteResponse.status}`);
    return fail("repo-route", `HTTP ${repoRouteResponse.status}: ${errorText}`);
  }

  logStep(ctx, 4, "repo-route", true);

  // ── Step 5: Linear Project (LAST — triggers orchestrator.start()) ─────

  const projectsResponse = await setupGet(baseUrl, "/api/v1/setup/linear-projects");

  if (!projectsResponse.ok) {
    const errorText = await projectsResponse.text().catch(() => "<unreadable>");
    logStep(ctx, 5, "linear-project", false, `list failed: ${projectsResponse.status}`);
    return fail("linear-project", `GET linear-projects HTTP ${projectsResponse.status}: ${errorText}`);
  }

  const projectsBody = (await projectsResponse.json()) as {
    projects: Array<{ id: string; name: string; slugId: string; teamKey: string | null }>;
  };

  const matchedProject = projectsBody.projects.find((project) => project.slugId === config.linear.project_slug);

  if (!matchedProject) {
    const available = projectsBody.projects.map((project) => project.slugId).join(", ");
    logStep(ctx, 5, "linear-project", false, `slug "${config.linear.project_slug}" not found`);
    return fail("linear-project", `Project slug "${config.linear.project_slug}" not found. Available: [${available}]`);
  }

  const selectResponse = await setupPost(baseUrl, "/api/v1/setup/linear-project", {
    slugId: matchedProject.slugId,
  });

  if (!selectResponse.ok) {
    const errorText = await selectResponse.text().catch(() => "<unreadable>");
    logStep(ctx, 5, "linear-project", false, `select failed: ${selectResponse.status}`);
    return fail("linear-project", `POST linear-project HTTP ${selectResponse.status}: ${errorText}`);
  }

  logStep(ctx, 5, "linear-project", true, matchedProject.name);

  // ── Final verification ────────────────────────────────────────────────

  // 1. Check setup status — all 5 individual steps should be done
  const finalStatusResponse = await setupGet(baseUrl, "/api/v1/setup/status");

  if (!finalStatusResponse.ok) {
    return fail("verification", `GET setup/status HTTP ${finalStatusResponse.status}`);
  }

  const finalStatus = (await finalStatusResponse.json()) as {
    configured: boolean;
    steps: Record<string, { done: boolean }>;
  };

  const requiredSteps = ["masterKey", "repoRoute", "openaiKey", "githubToken", "linearProject"] as const;
  const incompleteSteps = requiredSteps.filter((step) => !finalStatus.steps[step]?.done);

  if (incompleteSteps.length > 0) {
    const detail = `incomplete: ${incompleteSteps.join(", ")}`;
    ctx.events.write({ phase: "setup-wizard", step: "verification", status: "fail", detail });
    console.log(`  [setup-wizard] verification: FAIL  (${detail})`);
    return fail("verification", `Setup steps not completed: ${incompleteSteps.join(", ")}`);
  }

  ctx.events.write({
    phase: "setup-wizard",
    step: "verification",
    status: "pass",
    configured: finalStatus.configured,
    allStepsDone: true,
  });
  console.log(`  [setup-wizard] all 5 steps done, configured=${finalStatus.configured}`);

  // 2. Check orchestrator started — just verify 200 from /api/v1/state
  const stateResponse = await setupGet(baseUrl, "/api/v1/state");

  if (!stateResponse.ok) {
    return fail(
      "verification",
      `GET /api/v1/state returned ${stateResponse.status} — orchestrator may not have started`,
    );
  }

  ctx.events.write({ phase: "setup-wizard", step: "orchestrator-alive", status: "pass" });
  console.log("  [setup-wizard] orchestrator is alive (state endpoint 200)");

  return {
    phase: "setup-wizard",
    status: "pass",
    durationMs: Date.now() - start,
    data: { stepsCompleted: 5 },
  };
}
