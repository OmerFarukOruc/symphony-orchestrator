import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const hookRoot = path.resolve(".codex/hooks");
const python3 = "/usr/bin/python3";

type HookResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function createHookRepo(status?: Record<string, unknown>): string {
  const repoDir = mkdtempSync(path.join(tmpdir(), "risoluto-pre-tool-policy-"));
  const hooksDir = path.join(repoDir, ".codex", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  cpSync(path.join(hookRoot, "pre_tool_policy.py"), path.join(hooksDir, "pre_tool_policy.py"));
  cpSync(path.join(hookRoot, "anvil_state.py"), path.join(hooksDir, "anvil_state.py"));

  spawnSync("git", ["init", "-q"], { cwd: repoDir, encoding: "utf8" });

  if (status !== undefined) {
    const anvilDir = path.join(repoDir, ".anvil", "sample-run");
    mkdirSync(anvilDir, { recursive: true });
    writeFileSync(path.join(repoDir, ".anvil", "ACTIVE_RUN"), "sample-run\n", "utf8");
    writeFileSync(path.join(anvilDir, "status.json"), `${JSON.stringify(status, null, 2)}\n`, "utf8");
  }

  return repoDir;
}

function runPreTool(repoDir: string, command: string): HookResult {
  const payload = {
    cwd: repoDir,
    tool_input: {
      command,
    },
  };

  const result = spawnSync(python3, [path.join(repoDir, ".codex", "hooks", "pre_tool_policy.py")], {
    cwd: repoDir,
    encoding: "utf8",
    input: JSON.stringify(payload),
  });

  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function permissionReason(result: HookResult): string | null {
  if (!result.stdout) {
    return null;
  }

  const parsed = JSON.parse(result.stdout) as {
    hookSpecificOutput?: { permissionDecisionReason?: string };
  };
  return parsed.hookSpecificOutput?.permissionDecisionReason ?? null;
}

describe("pre_tool_policy", () => {
  it("ignores unrelated shell commands even when ACTIVE_RUN exists", () => {
    const repoDir = createHookRepo({
      slug: "sample-run",
      phase: "execute",
      active: true,
      pending_phases: ["verify", "docs-tests-closeout", "final-push"],
      pending_gates: [],
      open_claims: 0,
      failed_claims: 0,
      docs_status: "pending",
      tests_status: "pending",
      push_status: "not_started",
    });

    const result = runPreTool(repoDir, "ls -la");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("blocks push while an anvil run is actually active", () => {
    const repoDir = createHookRepo({
      slug: "sample-run",
      phase: "verify",
      active: true,
      pending_phases: ["final-push"],
      pending_gates: ["test"],
      open_claims: 1,
      failed_claims: 0,
      docs_status: "pending",
      tests_status: "pending",
      push_status: "not_started",
    });

    const result = runPreTool(repoDir, "git push origin main");

    expect(result.status).toBe(0);
    expect(permissionReason(result)).toContain("git push is blocked");
  });

  it("allows push when ACTIVE_RUN points to a paused run", () => {
    const repoDir = createHookRepo({
      slug: "sample-run",
      phase: "final-push",
      active: false,
      pending_phases: ["final-push"],
      pending_gates: [],
      open_claims: 0,
      failed_claims: 0,
      docs_status: "complete",
      tests_status: "complete",
      push_status: "blocked",
    });

    const result = runPreTool(repoDir, "git push origin main");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("allows push when ACTIVE_RUN is stale and status is missing", () => {
    const repoDir = createHookRepo();
    mkdirSync(path.join(repoDir, ".anvil"), { recursive: true });
    writeFileSync(path.join(repoDir, ".anvil", "ACTIVE_RUN"), "sample-run\n", "utf8");

    const result = runPreTool(repoDir, "git push origin main");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("blocks raw worktree creation only while a run is actually active", () => {
    const activeRepo = createHookRepo({
      slug: "sample-run",
      phase: "execute",
      active: true,
      pending_phases: ["verify", "docs-tests-closeout", "final-push"],
      pending_gates: [],
      open_claims: 0,
      failed_claims: 0,
      docs_status: "pending",
      tests_status: "pending",
      push_status: "not_started",
    });
    const pausedRepo = createHookRepo({
      slug: "sample-run",
      phase: "final-push",
      active: false,
      pending_phases: ["final-push"],
      pending_gates: [],
      open_claims: 0,
      failed_claims: 0,
      docs_status: "complete",
      tests_status: "complete",
      push_status: "blocked",
    });

    const blocked = runPreTool(activeRepo, "git worktree add ../tmp-worktree -b fix/main main");
    const allowed = runPreTool(pausedRepo, "git worktree add ../tmp-worktree -b fix/main main");

    expect(permissionReason(blocked)).toContain("managed worktree flow");
    expect(allowed.stdout).toBe("");
  });
});
