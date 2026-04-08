import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { patchStatus, readStatus, type AnvilStatus } from "./state.ts";

type CommandRunner = (command: string) => string;
type DependencyState =
  | "required-ready"
  | "required-missing"
  | "conditional-required-ready"
  | "conditional-required-missing"
  | "conditional-not-needed"
  | "optional-available"
  | "optional-missing";

type CheckSection = "skills" | "git" | "credentials";

type CheckResult = {
  name: string;
  message: string;
  ok: boolean;
  section: CheckSection;
};

type DependencyCheck = {
  name: string;
  state: DependencyState;
  message: string;
};

type BundleMetadata = {
  source_type?: string;
  source_items?: Array<string | Record<string, unknown>>;
  touches_ui?: boolean;
  requires_github_auth?: boolean;
  requires_linear_api?: boolean;
  requires_docker?: boolean;
  requires_ui_test?: boolean;
  verification_surfaces?: string[];
};

export type PreflightRunOptions = {
  expectedBaseBranch?: string;
  homeDir?: string;
  root: string;
  runCommand?: CommandRunner;
  skillSearchRoots?: string[];
  slug: string;
};

export type PreflightRunResult = {
  checks: CheckResult[];
  dependencyChecks: DependencyCheck[];
  nextPhase: AnvilStatus["phase"];
  passed: boolean;
  status: AnvilStatus;
};

const REQUIRED_FACTORY_SKILLS = [
  "anvil-brainstorm",
  "anvil-plan",
  "anvil-review",
  "anvil-audit",
  "anvil-execute",
  "anvil-verify",
] as const;
const IMPECCABLE_DIAGNOSTICS = ["critique", "audit"] as const;
const IMPECCABLE_FOLLOWUPS = [
  "polish",
  "optimize",
  "harden",
  "normalize",
  "bolder",
  "quieter",
  "clarify",
  "adapt",
  "distill",
  "animate",
  "arrange",
  "typeset",
  "delight",
  "colorize",
  "onboard",
  "overdrive",
  "extract",
] as const;
const EXECUTION_PHASES = new Set<AnvilStatus["phase"]>(["execute", "verify", "docs-tests-closeout", "final-push"]);

function runCommand(command: string): string {
  return execSync(command, { encoding: "utf8", stdio: "pipe" }).trim();
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function textIncludesGitHub(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().includes("github");
}

function textIncludesLinear(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().includes("linear");
}

function sourceItemsContain(
  sourceItems: BundleMetadata["source_items"],
  matcher: (value: unknown) => boolean,
): boolean {
  if (!Array.isArray(sourceItems)) {
    return false;
  }
  return sourceItems.some((item) => {
    if (matcher(item)) {
      return true;
    }
    if (typeof item === "object" && item !== null) {
      return Object.values(item).some((value) => matcher(value));
    }
    return false;
  });
}

function needsGitHubAuth(bundle: BundleMetadata | null): boolean {
  if (bundle?.requires_github_auth === true) {
    return true;
  }
  return (
    textIncludesGitHub(bundle?.source_type) ||
    sourceItemsContain(bundle?.source_items, (value) => typeof value === "string" && value.includes("github.com"))
  );
}

function needsLinearApi(bundle: BundleMetadata | null): boolean {
  if (bundle?.requires_linear_api === true) {
    return true;
  }
  return (
    textIncludesLinear(bundle?.source_type) ||
    sourceItemsContain(bundle?.source_items, (value) => typeof value === "string" && value.includes("linear.app"))
  );
}

function needsDocker(bundle: BundleMetadata | null): boolean {
  if (bundle?.requires_docker === true) {
    return true;
  }
  const verificationSurfaces = toStringList(bundle?.verification_surfaces);
  return verificationSurfaces.some((surface) => {
    const normalized = surface.toLowerCase();
    return normalized === "docker" || normalized === "lifecycle-e2e" || normalized === "sandbox";
  });
}

function needsUiTest(bundle: BundleMetadata | null): boolean {
  if (bundle?.requires_ui_test === true) {
    return true;
  }
  const verificationSurfaces = toStringList(bundle?.verification_surfaces);
  return verificationSurfaces.some((surface) => {
    const normalized = surface.toLowerCase();
    return normalized === "ui-test" || normalized === "browser-proof";
  });
}

function buildSkillSearchRoots(root: string, homeDir: string, customRoots?: string[]): string[] {
  if (customRoots && customRoots.length > 0) {
    return customRoots;
  }
  return [
    path.join(root, ".agents", "skills"),
    path.join(root, "skills"),
    path.join(root, ".codex", "skills"),
    path.join(homeDir, ".agents", "skills"),
    path.join(homeDir, ".codex", "skills"),
  ];
}

async function findSkill(name: string, skillSearchRoots: string[]): Promise<string | null> {
  for (const searchRoot of skillSearchRoots) {
    const skillPath = path.join(searchRoot, name, "SKILL.md");
    try {
      await fs.access(skillPath);
      return skillPath;
    } catch {
      continue;
    }
  }
  return null;
}

async function readBundle(root: string, slug: string): Promise<BundleMetadata | null> {
  try {
    const content = await fs.readFile(path.join(root, ".anvil", slug, "bundle.json"), "utf8");
    return JSON.parse(content) as BundleMetadata;
  } catch {
    return null;
  }
}

function allowsExecutionArtifacts(status: AnvilStatus): boolean {
  return status.integration_branch !== null || EXECUTION_PHASES.has(status.phase);
}

function formatPhaseName(phase: AnvilStatus["phase"]): string {
  return phase === "docs-tests-closeout" ? "docs/tests closeout" : phase;
}

function buildNextRequiredAction(
  failure: CheckResult | DependencyCheck | null,
  nextPhase: AnvilStatus["phase"],
  status: AnvilStatus,
): string {
  if (!failure) {
    if (nextPhase === "intake") {
      return "Start intake and write .anvil/<slug>/intake.md.";
    }
    if (nextPhase === status.phase) {
      return `Resume ${formatPhaseName(nextPhase)} using the refreshed preflight record and current handoff.`;
    }
    return `Resume ${formatPhaseName(nextPhase)} after the refreshed preflight check.`;
  }

  switch (failure.name) {
    case "git-clean":
      return "Clean, stash, or commit unrelated working tree changes before rerunning preflight.";
    case "git-branch":
      return "Switch to the expected base branch or the recorded integration branch before rerunning preflight.";
    case "git-worktrees":
      return "Remove stale worktrees or confirm the run-owned integration worktrees before rerunning preflight.";
    case "active-run-conflict":
      return "Pause or complete the conflicting active run before starting this one.";
    case "build":
      return "Fix the current build failure and rerun preflight.";
    case "gh-auth":
      return "Authenticate GitHub access with gh auth login and rerun preflight.";
    case "linear-api-key":
      return "Export LINEAR_API_KEY for this shell and rerun preflight.";
    case "docker-info":
      return "Start Docker and rerun preflight.";
    default:
      if (failure.name.startsWith("skill:")) {
        return `Install or restore the missing skill dependency ${failure.name.slice("skill:".length)} before rerunning preflight.`;
      }
      if (failure.name === "impeccable-family") {
        return "Install the required Impeccable diagnostic entry points and at least one follow-up skill before rerunning preflight.";
      }
      return "Resolve the reported preflight blocker and rerun preflight.";
  }
}

function createCloseout(slug: string, status: AnvilStatus, verificationSummary: string, followUp: string): string {
  return [
    "# Closeout",
    "",
    "## Ship State",
    `- Run: ${slug}`,
    `- Phase: ${status.phase} (${status.phase_status})`,
    `- Loop state: ${status.active ? "active" : status.phase_status === "blocked" ? "blocked" : "paused"}`,
    `- Branch: ${status.integration_branch ?? "none yet"}`,
    "- Commit: none yet",
    "- PR: none yet",
    "- Delivery state: planning-only",
    "",
    "## What Changed",
    "- Preflight refreshed the readiness record and stopped the run before intake because an avoidable blocker remains.",
    "",
    "## Verification",
    `- ${verificationSummary}`,
    "",
    "## Artifacts",
    `- .anvil/${slug}/status.json`,
    `- .anvil/${slug}/preflight.md`,
    `- .anvil/${slug}/handoff.md`,
    "",
    "## Follow-up",
    `- ${followUp}`,
    "",
  ].join("\n");
}

async function appendPipelineLog(root: string, slug: string, heading: string, lines: string[]): Promise<void> {
  const logPath = path.join(root, ".anvil", slug, "pipeline.log");
  const timestamp = new Date().toISOString();
  const entry = [`## ${heading}`, `**Updated**: ${timestamp}`, ...lines, ""].join("\n");
  await fs.appendFile(logPath, `${entry}\n`, "utf8");
}

function createPreflightDocument(
  slug: string,
  status: AnvilStatus,
  dependencyChecks: DependencyCheck[],
  checks: CheckResult[],
  decision: string,
  nextAction: string,
): string {
  const skillLines = dependencyChecks.map((check) => `- ${check.name}: ${check.state} — ${check.message}`);
  const gitLines = checks
    .filter((check) => check.section === "git")
    .map((check) => `- ${check.name}: ${check.ok ? "pass" : "fail"} — ${check.message}`);
  const credentialLines = checks
    .filter((check) => check.section === "credentials")
    .map((check) => `- ${check.name}: ${check.ok ? "pass" : "fail"} — ${check.message}`);

  return [
    "# Preflight",
    "",
    "## Run State",
    `- Run: ${slug}`,
    `- Phase: ${status.phase} (${status.phase_status})`,
    `- Loop state: ${status.active ? "active" : status.phase_status === "blocked" ? "blocked" : "paused"}`,
    "",
    "## Required Factory Skills",
    ...skillLines,
    "",
    "## Git And Repo Checks",
    ...gitLines,
    "",
    "## Credentials And Tooling Checks",
    ...credentialLines,
    "",
    "## Ready / Blocked Decision",
    `- Decision: ${decision}`,
    "",
    "## Next Action",
    `- ${nextAction}`,
    "",
  ].join("\n");
}

function createHandoff(
  slug: string,
  status: AnvilStatus,
  summary: string,
  evidence: string[],
  openRisk: string,
): string {
  const loopState = status.active ? "active" : status.phase_status === "blocked" ? "blocked" : "paused";
  return [
    "# Handoff",
    "",
    "## Current State",
    `- Run: ${slug}`,
    `- Phase: ${status.phase} (${status.phase_status})`,
    `- Loop state: ${loopState}`,
    `- Next required action: ${status.next_required_action}`,
    "",
    "## What Changed",
    summary,
    "",
    "## Open First",
    `1. \`.anvil/${slug}/status.json\` - machine-readable run state.`,
    `2. \`.anvil/${slug}/preflight.md\` - latest readiness decision and blockers.`,
    `3. \`.anvil/${slug}/pipeline.log\` - append-only readiness history.`,
    "",
    "## Evidence",
    ...evidence.map((line) => `- ${line}`),
    "",
    "## Open Risk",
    `- ${openRisk}`,
    "",
    "## Resume Here",
    `- ${status.next_required_action}`,
    "",
  ].join("\n");
}

async function buildDependencyChecks(
  root: string,
  homeDir: string,
  bundle: BundleMetadata | null,
  skillSearchRoots?: string[],
): Promise<DependencyCheck[]> {
  const searchRoots = buildSkillSearchRoots(root, homeDir, skillSearchRoots);
  const checks: DependencyCheck[] = [];

  for (const skillName of REQUIRED_FACTORY_SKILLS) {
    const skillPath = await findSkill(skillName, searchRoots);
    checks.push({
      name: `skill:${skillName}`,
      state: skillPath ? "required-ready" : "required-missing",
      message: skillPath ? `found at ${skillPath}` : "required factory skill is unavailable",
    });
  }

  const touchesUi = bundle?.touches_ui === true;
  const visualVerifyPath = await findSkill("visual-verify", searchRoots);
  checks.push({
    name: "skill:visual-verify",
    state: touchesUi
      ? visualVerifyPath
        ? "conditional-required-ready"
        : "conditional-required-missing"
      : "conditional-not-needed",
    message: touchesUi
      ? visualVerifyPath
        ? `found at ${visualVerifyPath}`
        : "run touches UI and requires visual verification"
      : "run does not materially touch UI",
  });

  const uiTestRequired = needsUiTest(bundle);
  const uiTestPath = await findSkill("ui-test", searchRoots);
  checks.push({
    name: "skill:ui-test",
    state: uiTestRequired
      ? uiTestPath
        ? "conditional-required-ready"
        : "conditional-required-missing"
      : "conditional-not-needed",
    message: uiTestRequired
      ? uiTestPath
        ? `found at ${uiTestPath}`
        : "run requested browser-driven UI proof"
      : "bundle metadata does not require ui-test",
  });

  if (!touchesUi) {
    checks.push({
      name: "impeccable-family",
      state: "conditional-not-needed",
      message: "run does not materially touch UI or UX surfaces",
    });
    return checks;
  }

  const diagnosticPaths = await Promise.all(IMPECCABLE_DIAGNOSTICS.map((name) => findSkill(name, searchRoots)));
  const followUpPaths = await Promise.all(IMPECCABLE_FOLLOWUPS.map((name) => findSkill(name, searchRoots)));
  const missingDiagnostics = IMPECCABLE_DIAGNOSTICS.filter((_, index) => !diagnosticPaths[index]);
  const availableFollowUps = IMPECCABLE_FOLLOWUPS.filter((_, index) => Boolean(followUpPaths[index]));
  const state =
    missingDiagnostics.length === 0 && availableFollowUps.length > 0
      ? "conditional-required-ready"
      : "conditional-required-missing";

  checks.push({
    name: "impeccable-family",
    state,
    message:
      state === "conditional-required-ready"
        ? `diagnostics ready and ${availableFollowUps.length} follow-up skills available`
        : [
            missingDiagnostics.length > 0 ? `missing diagnostics: ${missingDiagnostics.join(", ")}` : null,
            availableFollowUps.length === 0 ? "no Impeccable follow-up skills available" : null,
          ]
            .filter(Boolean)
            .join("; "),
  });

  return checks;
}

export async function runPreflight(options: PreflightRunOptions): Promise<PreflightRunResult> {
  const root = options.root;
  const slug = options.slug;
  const expectedBaseBranch = options.expectedBaseBranch ?? "main";
  const homeDir = options.homeDir ?? os.homedir();
  const runCommandImpl = options.runCommand ?? runCommand;
  const statusPath = path.join(root, ".anvil", slug, "status.json");
  const bundle = await readBundle(root, slug);
  const currentStatus = await readStatus(statusPath);
  const dependencyChecks = await buildDependencyChecks(root, homeDir, bundle, options.skillSearchRoots);
  const checks: CheckResult[] = [];
  const executionArtifactsAllowed = allowsExecutionArtifacts(currentStatus);

  const gitStatus = runCommandImpl("git status --porcelain");
  checks.push({
    name: "git-clean",
    ok: gitStatus.length === 0 || executionArtifactsAllowed,
    message:
      gitStatus.length === 0
        ? "working tree clean"
        : executionArtifactsAllowed
          ? "working tree has in-progress changes, allowed because the run already owns execution artifacts"
          : `working tree is dirty:\n${gitStatus}`,
    section: "git",
  });

  const currentBranch = runCommandImpl("git branch --show-current");
  const allowedBranches =
    executionArtifactsAllowed && currentStatus.integration_branch
      ? new Set([expectedBaseBranch, currentStatus.integration_branch])
      : new Set([expectedBaseBranch]);
  checks.push({
    name: "git-branch",
    ok: allowedBranches.has(currentBranch),
    message: allowedBranches.has(currentBranch)
      ? `on allowed branch ${currentBranch}`
      : `current branch is ${currentBranch}; allowed branches are ${Array.from(allowedBranches).join(", ")}`,
    section: "git",
  });

  const worktrees = runCommandImpl("git worktree list");
  const worktreeCount = worktrees.split("\n").filter(Boolean).length;
  checks.push({
    name: "git-worktrees",
    ok: worktreeCount <= 1 || executionArtifactsAllowed,
    message:
      worktreeCount <= 1
        ? "no extra worktrees detected"
        : executionArtifactsAllowed
          ? `extra worktrees detected and allowed for an execution-phase run:\n${worktrees}`
          : `unexpected extra worktrees detected before execution:\n${worktrees}`,
    section: "git",
  });

  try {
    const activeRunPath = path.join(root, ".anvil", "ACTIVE_RUN");
    const activeSlug = (await fs.readFile(activeRunPath, "utf8")).trim();
    if (activeSlug && activeSlug !== slug) {
      const activeStatus = await readStatus(path.join(root, ".anvil", activeSlug, "status.json"));
      checks.push({
        name: "active-run-conflict",
        ok: !activeStatus.active,
        message: activeStatus.active
          ? `active run "${activeSlug}" is still in progress (phase: ${activeStatus.phase})`
          : `active run "${activeSlug}" is inactive; proceeding`,
        section: "git",
      });
    } else {
      checks.push({ name: "active-run-conflict", ok: true, message: "no conflicting active run", section: "git" });
    }
  } catch {
    checks.push({ name: "active-run-conflict", ok: true, message: "no ACTIVE_RUN conflict detected", section: "git" });
  }

  try {
    runCommandImpl("pnpm run build");
    checks.push({ name: "build", ok: true, message: "pnpm run build passed", section: "git" });
  } catch {
    checks.push({ name: "build", ok: false, message: "pnpm run build failed", section: "git" });
  }

  const githubRequired = needsGitHubAuth(bundle);
  if (githubRequired) {
    try {
      runCommandImpl("gh auth status");
      checks.push({ name: "gh-auth", ok: true, message: "gh auth status passed", section: "credentials" });
    } catch {
      checks.push({
        name: "gh-auth",
        ok: false,
        message: "gh auth status failed; run gh auth login",
        section: "credentials",
      });
    }
  } else {
    checks.push({
      name: "gh-auth",
      ok: true,
      message: "GitHub auth not required for this run",
      section: "credentials",
    });
  }

  if (needsLinearApi(bundle)) {
    const linearKey = process.env.LINEAR_API_KEY?.trim() ?? "";
    checks.push({
      name: "linear-api-key",
      ok: linearKey.length > 0,
      message: linearKey.length > 0 ? "LINEAR_API_KEY present" : "LINEAR_API_KEY is missing or empty",
      section: "credentials",
    });
  } else {
    checks.push({
      name: "linear-api-key",
      ok: true,
      message: "Linear API key not required for this run",
      section: "credentials",
    });
  }

  if (needsDocker(bundle)) {
    try {
      runCommandImpl("docker info");
      checks.push({ name: "docker-info", ok: true, message: "docker info passed", section: "credentials" });
    } catch {
      checks.push({
        name: "docker-info",
        ok: false,
        message: "docker info failed; Docker is unavailable",
        section: "credentials",
      });
    }
  } else {
    checks.push({
      name: "docker-info",
      ok: true,
      message: "Docker is not required for this run",
      section: "credentials",
    });
  }

  const dependencyFailure = dependencyChecks.find(
    (check) => check.state === "required-missing" || check.state === "conditional-required-missing",
  );
  const checkFailure = checks.find((check) => !check.ok);
  const failure = dependencyFailure ?? checkFailure ?? null;
  const nextPhase =
    currentStatus.phase === "preflight" ? (currentStatus.pending_phases[0] ?? "intake") : currentStatus.phase;
  const nextRequiredAction = buildNextRequiredAction(failure, nextPhase, currentStatus);

  const status = failure
    ? await patchStatus(statusPath, {
        phase: "preflight",
        phase_status: "blocked",
        active: false,
        last_failure_reason: failure.message,
        next_required_action: nextRequiredAction,
      })
    : await patchStatus(statusPath, {
        phase: nextPhase,
        phase_status: "pending",
        active: true,
        pending_phases: currentStatus.pending_phases.filter((phase) => phase !== nextPhase),
        last_failure_reason: null,
        next_required_action: nextRequiredAction,
      });

  const preflightDocument = createPreflightDocument(
    slug,
    status,
    dependencyChecks,
    checks,
    failure ? `blocked — ${failure.message}` : `ready — resume ${formatPhaseName(nextPhase)}`,
    nextRequiredAction,
  );
  await fs.writeFile(path.join(root, ".anvil", slug, "preflight.md"), preflightDocument, "utf8");

  const summary = failure
    ? "Preflight found an avoidable blocker and left the run paused before continuing."
    : "Preflight refreshed readiness, recorded the current environment state, and advanced the run to the next pending phase.";
  const evidence = [
    ...dependencyChecks.map((check) => `${check.name}: ${check.state}`),
    ...checks.map((check) => `${check.name}: ${check.ok ? "pass" : "fail"}`),
  ];
  const handoff = createHandoff(
    slug,
    status,
    summary,
    evidence,
    failure ? failure.message : "No preflight blocker is currently recorded.",
  );
  await fs.writeFile(path.join(root, ".anvil", slug, "handoff.md"), handoff, "utf8");

  await appendPipelineLog(root, slug, failure ? "Phase 0: Preflight blocked" : "Phase 0: Preflight passed", [
    `- Decision: ${failure ? "blocked" : "ready"}`,
    `- Next phase: ${failure ? "preflight" : nextPhase}`,
    ...dependencyChecks.map((check) => `- ${check.name}: ${check.state}`),
    ...checks.map((check) => `- ${check.name}: ${check.ok ? "pass" : "fail"} — ${check.message}`),
  ]);

  if (failure) {
    const closeout = createCloseout(slug, status, failure.message, nextRequiredAction);
    await fs.writeFile(path.join(root, ".anvil", slug, "closeout.md"), closeout, "utf8");
  }

  return {
    checks,
    dependencyChecks,
    nextPhase,
    passed: !failure,
    status,
  };
}

async function main(): Promise<number> {
  const root = process.cwd();
  const slug = process.argv[2];
  const expectedBaseBranch = process.argv[3] ?? "main";
  if (!slug) {
    throw new TypeError("Usage: pnpm exec tsx preflight.ts <slug> [expected-base-branch]");
  }

  const result = await runPreflight({ root, slug, expectedBaseBranch });
  for (const check of result.dependencyChecks) {
    const prefix = check.state.endsWith("missing") ? "FAIL" : "PASS";
    console.log(`${prefix} ${check.name}: ${check.state} — ${check.message}`);
  }
  for (const check of result.checks) {
    const prefix = check.ok ? "PASS" : "FAIL";
    console.log(`${prefix} ${check.name}: ${check.message}`);
  }
  console.log(`\nPreflight ${result.passed ? "passed" : "failed"} for ${result.status.slug}.`);
  return result.passed ? 0 : 1;
}

const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : "";
const invokedDirectly =
  entryArg.length > 0 &&
  (import.meta.url === pathToFileURL(entryArg).href || fileURLToPath(import.meta.url) === entryArg);

if (invokedDirectly) {
  process.exitCode = await main();
}
