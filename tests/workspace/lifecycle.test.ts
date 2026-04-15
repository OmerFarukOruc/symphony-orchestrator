import { describe, expect, it, vi, beforeEach } from "vitest";

import { WorkspaceLifecycle, type WorkspaceManagerWorktreeDeps } from "../../src/workspace/lifecycle.js";
import type { ServiceConfig } from "../../src/core/types.js";
import { createMockLogger } from "../helpers.js";

const statMock = vi.fn();
const mkdirMock = vi.fn<typeof import("node:fs/promises").mkdir>();
const rmMock = vi.fn<typeof import("node:fs/promises").rm>();

vi.mock("node:fs/promises", () => ({
  stat: (...args: Parameters<typeof import("node:fs/promises").stat>) => statMock(...args),
  mkdir: (...args: Parameters<typeof import("node:fs/promises").mkdir>) => mkdirMock(...args),
  rm: (...args: Parameters<typeof import("node:fs/promises").rm>) => rmMock(...args),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn().mockReturnValue({
    on: vi.fn(),
    stderr: { on: vi.fn() },
    kill: vi.fn(),
  }),
}));

function createConfig(overrides?: Partial<ServiceConfig["workspace"]>): ServiceConfig {
  return {
    workspace: {
      root: "/tmp/workspaces",
      strategy: "directory",
      branchPrefix: "risoluto/",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 5000 },
      ...overrides,
    },
  } as unknown as ServiceConfig;
}

function createWorktreeDeps(): WorkspaceManagerWorktreeDeps {
  return {
    gitManager: {
      hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      autoCommit: vi.fn().mockResolvedValue("auto-commit-sha"),
      setupWorktree: vi.fn().mockResolvedValue({ branchName: "risoluto/NIN-1" }),
      removeWorktree: vi.fn().mockResolvedValue(undefined),
      deriveBaseCloneDir: vi.fn().mockReturnValue("/tmp/workspaces/.bare-clones/repo"),
    },
    repoRouter: {
      matchIssue: vi.fn().mockReturnValue({
        repoUrl: "https://github.com/acme/app.git",
        localPath: "/tmp/workspaces/.bare-clones/repo",
      }),
    },
  };
}

describe("WorkspaceLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined as never);
    rmMock.mockResolvedValue(undefined as never);
  });

  it("creates directory workspaces through the lifecycle boundary", async () => {
    statMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const lifecycle = new WorkspaceLifecycle(() => createConfig(), createMockLogger(), null);

    const workspace = await lifecycle.ensureWorkspace("NIN-1");

    expect(workspace).toMatchObject({
      workspaceKey: "NIN-1",
      createdNow: true,
    });
    expect(mkdirMock).toHaveBeenCalled();
  });

  it("removes worktree workspaces through the lifecycle boundary", async () => {
    const deps = createWorktreeDeps();
    statMock.mockResolvedValue({ isDirectory: () => true });
    const lifecycle = new WorkspaceLifecycle(() => createConfig({ strategy: "worktree" }), createMockLogger(), deps);

    const result = await lifecycle.removeWorkspaceWithResult("NIN-1", {
      id: "issue-1",
      identifier: "NIN-1",
      title: "Issue",
      description: null,
      priority: 1,
      state: "In Progress",
      branchName: "feature/NIN-1",
      url: null,
      labels: [],
      blockedBy: [],
      createdAt: null,
      updatedAt: null,
    });

    expect(deps.gitManager.removeWorktree).toHaveBeenCalledOnce();
    expect(result.removed).toBe(true);
  });
});
