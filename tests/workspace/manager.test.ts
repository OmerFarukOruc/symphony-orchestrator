import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";

import { WorkspaceManager, type WorkspaceManagerWorktreeDeps } from "../../src/workspace/manager.js";
import type { ServiceConfig } from "../../src/core/types.js";
import { createMockLogger } from "../helpers.js";

// ---------------------------------------------------------------------------
// Mock node:fs/promises
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createConfig(overrides?: Partial<ServiceConfig["workspace"]>): ServiceConfig {
  return {
    workspace: {
      root: "/tmp/workspaces",
      strategy: "directory",
      branchPrefix: "symphony/",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 5000 },
      ...overrides,
    },
  } as unknown as ServiceConfig;
}

function createWorktreeDeps(): WorkspaceManagerWorktreeDeps {
  return {
    gitManager: {
      setupWorktree: vi.fn().mockResolvedValue({ branchName: "symphony/NIN-1" }),
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

function createIssue(identifier = "NIN-1") {
  return {
    id: "issue-1",
    identifier,
    title: "Test issue",
    description: null,
    state: "In Progress",
    url: "https://linear.app/team/NIN-1",
    priority: 2,
    branchName: "feature/NIN-1",
    labels: [] as string[],
    blockedBy: [] as { id: string | null; identifier: string | null; state: string | null }[],
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorkspaceManager", () => {
  const logger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined as never);
    rmMock.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ensureWorkspace (directory strategy)", () => {
    it("creates workspace directory on first access", async () => {
      const config = createConfig();
      const manager = new WorkspaceManager(() => config, logger);

      // Simulate: workspace does not exist → ENOENT → mkdir creates it
      statMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const workspace = await manager.ensureWorkspace("NIN-1");

      expect(workspace.createdNow).toBe(true);
      expect(workspace.workspaceKey).toBe("NIN-1");
      expect(workspace.path).toBe(path.resolve("/tmp/workspaces", "NIN-1"));
      expect(mkdirMock).toHaveBeenCalled();
    });

    it("returns existing workspace without creating", async () => {
      const config = createConfig();
      const manager = new WorkspaceManager(() => config, logger);

      // Workspace exists as a directory
      statMock.mockResolvedValue({ isDirectory: () => true });

      const workspace = await manager.ensureWorkspace("NIN-1");

      expect(workspace.createdNow).toBe(false);
      expect(workspace.workspaceKey).toBe("NIN-1");
    });

    it("throws when workspace target is not a directory", async () => {
      const config = createConfig();
      const manager = new WorkspaceManager(() => config, logger);

      statMock.mockResolvedValue({ isDirectory: () => false });

      await expect(manager.ensureWorkspace("NIN-1")).rejects.toThrow("not a directory");
    });
  });

  describe("ensureWorkspace (worktree strategy)", () => {
    it("throws when issue is not provided for worktree strategy", async () => {
      const config = createConfig({ strategy: "worktree" });
      const manager = new WorkspaceManager(() => config, logger, createWorktreeDeps());

      await expect(manager.ensureWorkspace("NIN-1")).rejects.toThrow(
        "worktree strategy requires the full Issue object",
      );
    });

    it("throws when worktree deps are missing", async () => {
      const config = createConfig({ strategy: "worktree" });
      const manager = new WorkspaceManager(() => config, logger);

      await expect(manager.ensureWorkspace("NIN-1", createIssue())).rejects.toThrow(
        "worktree strategy requires gitManager and repoRouter deps",
      );
    });

    it("throws when no repo match found for issue", async () => {
      const config = createConfig({ strategy: "worktree" });
      const deps = createWorktreeDeps();
      vi.mocked(deps.repoRouter.matchIssue).mockReturnValue(null);
      const manager = new WorkspaceManager(() => config, logger, deps);

      await expect(manager.ensureWorkspace("NIN-1", createIssue())).rejects.toThrow("no matching repo route found");
    });

    it("creates worktree workspace via gitManager on first access", async () => {
      const config = createConfig({ strategy: "worktree" });
      const deps = createWorktreeDeps();
      const manager = new WorkspaceManager(() => config, logger, deps);

      // Workspace does not exist
      statMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const workspace = await manager.ensureWorkspace("NIN-1", createIssue());

      expect(workspace.createdNow).toBe(true);
      expect(deps.gitManager.setupWorktree).toHaveBeenCalledOnce();
    });

    it("returns existing worktree workspace without re-creating", async () => {
      const config = createConfig({ strategy: "worktree" });
      const deps = createWorktreeDeps();
      const manager = new WorkspaceManager(() => config, logger, deps);

      // Workspace already exists
      statMock.mockResolvedValue({ isDirectory: () => true });

      const workspace = await manager.ensureWorkspace("NIN-1", createIssue());

      expect(workspace.createdNow).toBe(false);
      expect(deps.gitManager.setupWorktree).not.toHaveBeenCalled();
    });
  });

  describe("prepareForAttempt", () => {
    it("removes transient directories (tmp, .elixir_ls)", async () => {
      const config = createConfig();
      const manager = new WorkspaceManager(() => config, logger);
      const workspace = {
        path: "/tmp/workspaces/NIN-1",
        workspaceKey: "NIN-1",
        createdNow: false,
      };

      await manager.prepareForAttempt(workspace);

      expect(rmMock).toHaveBeenCalledWith(
        path.resolve("/tmp/workspaces/NIN-1", "tmp"),
        expect.objectContaining({ recursive: true }),
      );
      expect(rmMock).toHaveBeenCalledWith(
        path.resolve("/tmp/workspaces/NIN-1", ".elixir_ls"),
        expect.objectContaining({ recursive: true }),
      );
    });

    it("throws when workspace path escapes root", async () => {
      const config = createConfig();
      const manager = new WorkspaceManager(() => config, logger);
      const workspace = {
        path: "/etc/passwd",
        workspaceKey: "evil",
        createdNow: false,
      };

      await expect(manager.prepareForAttempt(workspace)).rejects.toThrow("workspace path escaped root");
    });
  });

  describe("removeWorkspace (directory strategy)", () => {
    it("removes existing workspace directory", async () => {
      const config = createConfig();
      const manager = new WorkspaceManager(() => config, logger);

      // Workspace exists
      statMock.mockResolvedValue({ isDirectory: () => true });

      await manager.removeWorkspace("NIN-1");

      expect(rmMock).toHaveBeenCalledWith(
        expect.stringContaining("NIN-1"),
        expect.objectContaining({ recursive: true }),
      );
    });

    it("is a no-op when workspace does not exist", async () => {
      const config = createConfig();
      const manager = new WorkspaceManager(() => config, logger);

      // Workspace does not exist
      statMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      await manager.removeWorkspace("NIN-1");

      // rm should not be called
      expect(rmMock).not.toHaveBeenCalled();
    });
  });

  describe("removeWorkspace (worktree strategy)", () => {
    it("removes via gitManager.removeWorktree", async () => {
      const config = createConfig({ strategy: "worktree" });
      const deps = createWorktreeDeps();
      const manager = new WorkspaceManager(() => config, logger, deps);

      // Workspace exists
      statMock.mockResolvedValue({ isDirectory: () => true });

      await manager.removeWorkspace("NIN-1", createIssue());

      expect(deps.gitManager.removeWorktree).toHaveBeenCalledOnce();
    });

    it("falls back to rm when removeWorktree fails", async () => {
      const config = createConfig({ strategy: "worktree" });
      const deps = createWorktreeDeps();
      vi.mocked(deps.gitManager.removeWorktree).mockRejectedValue(new Error("git error"));
      const manager = new WorkspaceManager(() => config, logger, deps);

      // Workspace exists
      statMock.mockResolvedValue({ isDirectory: () => true });

      await manager.removeWorkspace("NIN-1", createIssue());

      // Should fall back to rm
      expect(rmMock).toHaveBeenCalledWith(
        expect.stringContaining("NIN-1"),
        expect.objectContaining({ recursive: true }),
      );
    });

    it("throws when worktree deps are missing", async () => {
      const config = createConfig({ strategy: "worktree" });
      const manager = new WorkspaceManager(() => config, logger);

      await expect(manager.removeWorkspace("NIN-1")).rejects.toThrow(
        "worktree strategy requires gitManager and repoRouter deps",
      );
    });
  });

  describe("sanitizeIdentifier", () => {
    it("strips unsafe characters from workspace keys", async () => {
      const config = createConfig();
      const manager = new WorkspaceManager(() => config, logger);

      statMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const workspace = await manager.ensureWorkspace("FOO/BAR#123");

      // The sanitize function replaces non-alphanum + dash + dot + underscore with underscore
      expect(workspace.workspaceKey).toBe("FOO_BAR_123");
    });
  });
});
