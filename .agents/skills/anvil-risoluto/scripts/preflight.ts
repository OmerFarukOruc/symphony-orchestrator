import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { readStatus } from "./state.ts";

type CheckResult = {
  name: string;
  message: string;
  ok: boolean;
};

function runCommand(command: string): string {
  return execSync(command, { encoding: "utf8", stdio: "pipe" }).trim();
}

async function readBundle(root: string, slug: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(path.join(root, ".anvil", slug, "bundle.json"), "utf8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const slug = process.argv[2];
  const expectedBaseBranch = process.argv[3] ?? "main";
  if (!slug) {
    throw new Error("Usage: pnpm exec tsx preflight.ts <slug> [expected-base-branch]");
  }

  const results: CheckResult[] = [];
  const bundle = await readBundle(root, slug);
  const needsLinear = Boolean(bundle?.touches_backend);
  const needsDocker = Boolean(bundle?.touches_backend);

  const gitStatus = runCommand("git status --porcelain");
  results.push({
    name: "git-clean",
    ok: gitStatus.length === 0,
    message: gitStatus.length === 0 ? "working tree clean" : `working tree is dirty:\n${gitStatus}`,
  });

  const currentBranch = runCommand("git branch --show-current");
  results.push({
    name: "git-branch",
    ok: currentBranch === expectedBaseBranch,
    message:
      currentBranch === expectedBaseBranch
        ? `on expected base branch ${expectedBaseBranch}`
        : `current branch is ${currentBranch}; expected ${expectedBaseBranch}`,
  });

  const worktrees = runCommand("git worktree list");
  const worktreeCount = worktrees.split("\n").filter(Boolean).length;
  results.push({
    name: "git-worktrees",
    ok: worktreeCount <= 1,
    message: worktreeCount <= 1 ? "no extra worktrees detected" : `extra worktrees detected:\n${worktrees}`,
  });

  try {
    const activeRunPath = path.join(root, ".anvil", "ACTIVE_RUN");
    const activeSlug = (await fs.readFile(activeRunPath, "utf8")).trim();
    if (activeSlug && activeSlug !== slug) {
      const activeStatus = await readStatus(path.join(root, ".anvil", activeSlug, "status.json"));
      results.push({
        name: "active-run-conflict",
        ok: !activeStatus.active,
        message: activeStatus.active
          ? `active run "${activeSlug}" is still in progress (phase: ${activeStatus.phase})`
          : `active run "${activeSlug}" is inactive; proceeding`,
      });
    } else {
      results.push({ name: "active-run-conflict", ok: true, message: "no conflicting active run" });
    }
  } catch {
    results.push({ name: "active-run-conflict", ok: true, message: "no ACTIVE_RUN conflict detected" });
  }

  try {
    runCommand("pnpm run build");
    results.push({ name: "build", ok: true, message: "pnpm run build passed" });
  } catch {
    results.push({ name: "build", ok: false, message: "pnpm run build failed" });
  }

  try {
    runCommand("gh auth status");
    results.push({ name: "gh-auth", ok: true, message: "gh auth status passed" });
  } catch {
    results.push({ name: "gh-auth", ok: false, message: "gh auth status failed; run gh auth login" });
  }

  if (needsLinear) {
    const linearKey = process.env.LINEAR_API_KEY?.trim() ?? "";
    results.push({
      name: "linear-api-key",
      ok: linearKey.length > 0,
      message: linearKey.length > 0 ? "LINEAR_API_KEY present" : "LINEAR_API_KEY is missing or empty",
    });
  }

  if (needsDocker) {
    try {
      runCommand("docker info");
      results.push({ name: "docker-info", ok: true, message: "docker info passed" });
    } catch {
      results.push({ name: "docker-info", ok: false, message: "docker info failed; Docker is unavailable" });
    }
  }

  const failures = results.filter((result) => !result.ok);
  for (const result of results) {
    const prefix = result.ok ? "PASS" : "FAIL";
    console.log(`${prefix} ${result.name}: ${result.message}`);
  }

  if (failures.length > 0) {
    console.error(`\nPreflight failed: ${failures.map((failure) => failure.name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nPreflight passed.");
}

void main();
