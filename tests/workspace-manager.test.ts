import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../src/logger.js";
import type { ServiceConfig } from "../src/types.js";
import { WorkspaceManager } from "../src/workspace-manager.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-workspace-test-"));
  tempDirs.push(dir);
  return dir;
}

function createConfig(root: string): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      projectSlug: "EXAMPLE",
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root,
      hooks: {
        afterCreate: "echo after_create >> hook.log",
        beforeRun: "echo before_run >> hook.log",
        afterRun: "echo after_run >> hook.log",
        beforeRemove: "echo before_remove >> hook.log",
        timeoutMs: 1000,
      },
    },
    agent: {
      maxConcurrentAgents: 1,
      maxTurns: 1,
      maxRetryBackoffMs: 300000,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      stallTimeoutMs: 10000,
    },
    server: { port: 4000 },
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("WorkspaceManager", () => {
  it("creates, prepares, hooks, and removes safe workspaces", async () => {
    const root = await createTempDir();
    const manager = new WorkspaceManager(() => createConfig(root), createLogger());

    const workspace = await manager.ensureWorkspace("MT/42");
    expect(workspace.workspaceKey).toBe("MT_42");

    await mkdir(path.join(workspace.path, "tmp"), { recursive: true });
    await mkdir(path.join(workspace.path, ".elixir_ls"), { recursive: true });
    await manager.prepareForAttempt(workspace);
    await manager.runBeforeRun(workspace);
    await manager.runAfterRun(workspace);

    const hookLog = await readFile(path.join(workspace.path, "hook.log"), "utf8");
    expect(hookLog).toContain("after_create");
    expect(hookLog).toContain("before_run");
    expect(hookLog).toContain("after_run");

    await manager.removeWorkspace("MT/42");
    await expect(stat(workspace.path)).rejects.toThrow();
  });

  it("fails safely when workspace target is an existing file", async () => {
    const root = await createTempDir();
    const targetFile = path.join(root, "MT_99");
    await writeFile(targetFile, "not a directory", "utf8");

    const manager = new WorkspaceManager(() => createConfig(root), createLogger());
    await expect(manager.ensureWorkspace("MT_99")).rejects.toThrow("workspace target is not a directory");
  });
});
