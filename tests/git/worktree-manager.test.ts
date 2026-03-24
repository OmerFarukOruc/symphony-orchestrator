import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/core/logger.js";
import {
  addWorktree,
  attachWorktree,
  branchExists,
  deriveRepoKey,
  ensureBaseClone,
  isWorktreeClean,
  listWorktrees,
  removeWorktree,
  syncBaseClone,
  type WorktreeContext,
} from "../../src/git/worktree-manager.js";
import type { GitRunner } from "../../src/git/manager.js";

function createContext(runGit: GitRunner): WorktreeContext {
  return {
    runGit,
    env: {},
    logger: createLogger(),
  };
}

describe("worktree-manager", () => {
  it.each([
    ["https://github.com/acme/backend.git", "https-github.com-acme-backend"],
    ["git@github.com:acme/backend.git", "git-github.com-acme-backend"],
    [" ssh://git@example.com/team/platform repo.git ", "ssh-git-example.com-team-platform-repo"],
    ["!!!", "repo"],
  ])("derives a repo key for %s", (repoUrl, expected) => {
    expect(deriveRepoKey(repoUrl)).toBe(expected);
  });

  it("clones a base repo when it does not exist", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === "rev-parse") {
        throw new Error("missing git dir");
      }
      return { stdout: "", stderr: "" };
    };

    await ensureBaseClone(createContext(runGit), "https://github.com/acme/backend.git", "/tmp/base/backend.git");

    expect(calls).toEqual([
      ["rev-parse", "--git-dir"],
      ["clone", "--bare", "https://github.com/acme/backend.git", "/tmp/base/backend.git"],
    ]);
  });

  it("fetches an existing base repo instead of cloning", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === "rev-parse") {
        return { stdout: ".git\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };

    await ensureBaseClone(createContext(runGit), "https://github.com/acme/backend.git", "/tmp/base/backend.git");

    expect(calls).toEqual([
      ["rev-parse", "--git-dir"],
      ["fetch", "origin", "--prune"],
    ]);
  });

  it("syncs the base clone with prune", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    await syncBaseClone(createContext(runGit), "/tmp/base/backend.git");

    expect(calls).toEqual([["fetch", "origin", "--prune"]]);
  });

  it("adds a new worktree from a start point", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    await addWorktree(
      createContext(runGit),
      "/tmp/base/backend.git",
      "/tmp/worktrees/NIN-42",
      "symphony/nin-42",
      "main",
    );

    expect(calls).toEqual([["worktree", "add", "-b", "symphony/nin-42", "/tmp/worktrees/NIN-42", "main"]]);
  });

  it("attaches an existing branch as a worktree", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    await attachWorktree(createContext(runGit), "/tmp/base/backend.git", "/tmp/worktrees/NIN-42", "symphony/nin-42");

    expect(calls).toEqual([["worktree", "add", "/tmp/worktrees/NIN-42", "symphony/nin-42"]]);
  });

  it("removes a worktree and prunes metadata", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    await removeWorktree(createContext(runGit), "/tmp/base/backend.git", "/tmp/worktrees/NIN-42");

    expect(calls).toEqual([
      ["worktree", "remove", "/tmp/worktrees/NIN-42"],
      ["worktree", "prune"],
    ]);
  });

  it("force removes a worktree and prunes metadata", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    await removeWorktree(createContext(runGit), "/tmp/base/backend.git", "/tmp/worktrees/NIN-42", true);

    expect(calls).toEqual([
      ["worktree", "remove", "--force", "/tmp/worktrees/NIN-42"],
      ["worktree", "prune"],
    ]);
  });

  it("parses porcelain worktree listings", async () => {
    const runGit: GitRunner = async () => ({
      stdout: [
        "worktree /tmp/base/backend.git",
        "bare",
        "",
        "worktree /tmp/worktrees/main",
        "HEAD abcdef123",
        "branch refs/heads/main",
        "",
        "worktree /tmp/worktrees/detached",
        "HEAD deadbeef",
        "detached",
        "",
      ].join("\n"),
      stderr: "",
    });

    await expect(listWorktrees(createContext(runGit), "/tmp/base/backend.git")).resolves.toEqual([
      { path: "/tmp/base/backend.git", branch: null, bare: true },
      { path: "/tmp/worktrees/main", branch: "refs/heads/main", bare: false },
      { path: "/tmp/worktrees/detached", branch: null, bare: false },
    ]);
  });

  it.each([
    ["", true],
    [" M src/file.ts\n", false],
  ])("reports worktree cleanliness from porcelain status %j", async (stdout, expected) => {
    const runGit: GitRunner = async () => ({ stdout, stderr: "" });

    await expect(isWorktreeClean(createContext(runGit), "/tmp/worktrees/NIN-42")).resolves.toBe(expected);
  });

  it("detects when a branch exists", async () => {
    const runGit = vi.fn<GitRunner>(async () => ({ stdout: "refs/heads/symphony/nin-42\n", stderr: "" }));

    await expect(branchExists(createContext(runGit), "/tmp/base/backend.git", "symphony/nin-42")).resolves.toBe(true);
  });

  it("detects when a branch is missing", async () => {
    const runGit = vi.fn<GitRunner>(async () => {
      throw new Error("missing branch");
    });

    await expect(branchExists(createContext(runGit), "/tmp/base/backend.git", "symphony/nin-42")).resolves.toBe(false);
  });
});
