import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WorkspaceManager, type WorkspaceManagerWorktreeDeps } from "../../src/workspace/manager.js";
import type { Issue, ServiceConfig } from "../../src/core/types.js";
import { createMockLogger } from "../helpers.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-workspace-int-"));
  tempDirs.push(dir);
  return dir;
}

function createIssue(identifier = "NIN-42"): Issue {
  return {
    id: "issue-1",
    identifier,
    title: "Integration coverage for workspace lifecycle",
    description: null,
    priority: 2,
    state: "In Progress",
    branchName: `feature/${identifier}`,
    url: `https://linear.app/acme/issue/${identifier}`,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
  };
}

function createConfig(root: string, overrides: Partial<ServiceConfig["workspace"]> = {}): ServiceConfig {
  return {
    workspace: {
      root,
      strategy: "directory",
      branchPrefix: "risoluto/",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
      ...overrides,
    },
  } as unknown as ServiceConfig;
}

function createWorktreeDeps(root: string, options?: { removeShouldFail?: boolean }): WorkspaceManagerWorktreeDeps {
  return {
    gitManager: {
      setupWorktree: async (_route, _baseCloneDir, worktreePath) => {
        await mkdir(worktreePath, { recursive: true });
        await writeFile(path.join(worktreePath, ".git"), "gitdir: /tmp/fake.git\n", "utf8");
        return { branchName: "risoluto/NIN-42" };
      },
      removeWorktree: async (_baseCloneDir, worktreePath) => {
        if (options?.removeShouldFail) {
          throw new Error("git remove failed");
        }
        await rm(worktreePath, { recursive: true, force: true });
      },
      deriveBaseCloneDir: () => path.join(root, ".bare-clones", "repo"),
    },
    repoRouter: {
      matchIssue: () => ({
        repoUrl: "https://github.com/acme/app.git",
        localPath: path.join(root, ".bare-clones", "repo"),
      }),
    },
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("WorkspaceManager integration", () => {
  it("creates directory workspaces, runs hooks with sanitized env vars, and prunes transient directories", async () => {
    const root = await createTempDir();
    const config = createConfig(root, {
      hooks: {
        afterCreate: 'printf "%s\\n%s\\n" "$RISOLUTO_WORKSPACE_PATH" "$RISOLUTO_ISSUE_IDENTIFIER" > after-create.txt',
        beforeRun: 'printf "before:%s\\n" "$RISOLUTO_ISSUE_IDENTIFIER" > before-run.txt',
        afterRun: 'printf "after:%s\\n" "$RISOLUTO_ISSUE_IDENTIFIER" > after-run.txt',
        beforeRemove: null,
        timeoutMs: 1000,
      },
    });
    const logger = createMockLogger();
    const manager = new WorkspaceManager(() => config, logger);

    const workspace = await manager.ensureWorkspace("NIN/42");
    expect(workspace.createdNow).toBe(true);
    expect(workspace.workspaceKey).toBe("NIN_42");
    expect((await stat(workspace.path)).isDirectory()).toBe(true);

    expect(await readFile(path.join(workspace.path, "after-create.txt"), "utf8")).toBe(`${workspace.path}\nNIN_42\n`);

    await mkdir(path.join(workspace.path, "tmp"), { recursive: true });
    await mkdir(path.join(workspace.path, ".elixir_ls"), { recursive: true });
    await writeFile(path.join(workspace.path, "keep.txt"), "persist\n", "utf8");

    await manager.prepareForAttempt(workspace);
    await manager.runBeforeRun(workspace, "NIN/42");
    await manager.runAfterRun(workspace, "NIN/42");

    await expect(stat(path.join(workspace.path, "tmp"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(workspace.path, ".elixir_ls"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(workspace.path, "keep.txt"), "utf8")).toBe("persist\n");
    expect(await readFile(path.join(workspace.path, "before-run.txt"), "utf8")).toBe("before:NIN_42\n");
    expect(await readFile(path.join(workspace.path, "after-run.txt"), "utf8")).toBe("after:NIN_42\n");
  });

  it("times out long-running hooks and rejects the run", async () => {
    const root = await createTempDir();
    const config = createConfig(root, {
      hooks: {
        afterCreate: null,
        beforeRun: "sleep 1",
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 50,
      },
    });
    const manager = new WorkspaceManager(() => config, createMockLogger());
    const workspace = await manager.ensureWorkspace("NIN-42");

    await expect(manager.runBeforeRun(workspace, "NIN-42")).rejects.toThrow("hook timed out after 50ms");
  });

  it("logs beforeRemove hook failures but still removes directory workspaces", async () => {
    const root = await createTempDir();
    const config = createConfig(root, {
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: 'printf "remove failed" >&2; exit 7',
        timeoutMs: 1000,
      },
    });
    const logger = createMockLogger();
    const manager = new WorkspaceManager(() => config, logger);

    const workspace = await manager.ensureWorkspace("NIN-77");
    await writeFile(path.join(workspace.path, "artifact.txt"), "data\n", "utf8");

    await manager.removeWorkspace("NIN-77");

    await expect(stat(workspace.path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: workspace.path,
        issueIdentifier: "NIN-77",
        classification: "before_remove_hook_failed",
      }),
      "before_remove hook failed; continuing with workspace removal",
    );
  });

  it("creates worktree workspaces and falls back to rm when git worktree removal fails", async () => {
    const root = await createTempDir();
    const issue = createIssue("NIN-88");
    const config = createConfig(root, { strategy: "worktree" });
    const deps = createWorktreeDeps(root, { removeShouldFail: true });
    const logger = createMockLogger();
    const manager = new WorkspaceManager(() => config, logger, deps);

    const workspace = await manager.ensureWorkspace(issue.identifier, issue);
    expect(workspace.createdNow).toBe(true);
    expect(workspace.gitBaseDir).toBe(path.join(root, ".bare-clones", "repo"));
    expect((await stat(workspace.path)).isDirectory()).toBe(true);

    await manager.removeWorkspace(issue.identifier, issue);

    await expect(stat(workspace.path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: workspace.path,
        issueIdentifier: issue.identifier,
      }),
      "git worktree remove failed; falling back to rm",
    );
  });
});
