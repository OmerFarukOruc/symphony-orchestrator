import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const hookRoot = path.resolve(".codex/hooks");
const python3 = "/usr/bin/python3";

type HookResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function createHookRepo(status?: Record<string, unknown>): string {
  const repoDir = mkdtempSync(path.join(tmpdir(), "risoluto-post-tool-gate-"));
  const hooksDir = path.join(repoDir, ".codex", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  cpSync(path.join(hookRoot, "post_tool_gate.py"), path.join(hooksDir, "post_tool_gate.py"));
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

function runPostTool(repoDir: string, command: string, toolResponse?: Record<string, unknown>): HookResult {
  const payload = {
    cwd: repoDir,
    tool_input: {
      command,
    },
    tool_response: toolResponse ?? { exit_code: 0 },
  };

  const result = spawnSync(python3, [path.join(repoDir, ".codex", "hooks", "post_tool_gate.py")], {
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

function readStatus(repoDir: string): Record<string, unknown> {
  const statusPath = path.join(repoDir, ".anvil", "sample-run", "status.json");
  return JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, unknown>;
}

describe("post_tool_gate", () => {
  it("ignores unrelated shell commands even when an anvil run exists", () => {
    const repoDir = createHookRepo({
      slug: "sample-run",
      phase: "verify",
      active: true,
      pending_phases: ["final-push"],
      pending_gates: ["lint"],
      gate_results: {},
      open_claims: 0,
      failed_claims: 0,
      docs_status: "pending",
      tests_status: "pending",
      push_status: "not_started",
    });

    const before = readStatus(repoDir);
    const result = runPostTool(repoDir, "ls -la");
    const after = readStatus(repoDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(after).toEqual(before);
  });

  it("records a passing tracked gate for an active anvil run", () => {
    const repoDir = createHookRepo({
      slug: "sample-run",
      phase: "verify",
      active: true,
      pending_phases: ["final-push"],
      pending_gates: ["lint", "test"],
      gate_results: {},
      open_claims: 0,
      failed_claims: 0,
      docs_status: "pending",
      tests_status: "pending",
      push_status: "not_started",
    });

    const result = runPostTool(repoDir, "pnpm run lint", { exit_code: 0 });
    const after = readStatus(repoDir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Tracked gate passed: lint");
    expect(after.gate_results).toMatchObject({ lint: "passed" });
    expect(after.pending_gates).toEqual(["test"]);
  });
});
