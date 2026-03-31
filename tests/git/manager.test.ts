import { describe, expect, it, vi } from "vitest";

import { GitManager, type GitRunner } from "../../src/git/manager.js";
import type { RepoMatch } from "../../src/git/repo-router.js";
import type { Issue } from "../../src/core/types.js";

function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "NIN-42",
    title: "Implement feature",
    description: null,
    priority: null,
    state: "Todo",
    branchName: null,
    url: "https://linear.app/acme/issue/NIN-42",
    labels: [],
    blockedBy: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function createRepoMatch(overrides: Partial<RepoMatch> = {}): RepoMatch {
  return {
    repoUrl: "https://github.com/acme/backend.git",
    defaultBranch: "main",
    githubTokenEnv: "GITHUB_TOKEN",
    matchedBy: "identifier_prefix",
    ...overrides,
  };
}

describe("GitManager", () => {
  it("clones repository and creates a branch", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", createIssue());

    expect(result.branchName).toBe("risoluto/nin-42");
    expect(calls).toEqual([
      ["clone", "--branch", "main", "--single-branch", "https://github.com/acme/backend.git", "."],
      ["checkout", "-b", "risoluto/nin-42"],
    ]);
  });

  it("sets up a worktree for a new prefixed branch", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--git-dir") {
        return { stdout: ".git\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        throw new Error("missing branch");
      }
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.setupWorktree(
      createRepoMatch(),
      "/tmp/base/backend.git",
      "/tmp/worktrees/NIN-42",
      createIssue(),
      "feature/",
    );

    expect(result).toEqual({ branchName: "feature/nin-42" });
    expect(calls).toEqual([
      ["rev-parse", "--git-dir"],
      ["fetch", "origin", "--prune"],
      ["fetch", "origin", "--prune"],
      ["rev-parse", "--verify", "refs/heads/feature/nin-42"],
      ["worktree", "add", "-b", "feature/nin-42", "/tmp/worktrees/NIN-42", "main"],
    ]);
  });

  it("attaches an existing worktree branch", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--git-dir") {
        return { stdout: ".git\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return { stdout: "refs/heads/risoluto/nin-42\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.setupWorktree(
      createRepoMatch(),
      "/tmp/base/backend.git",
      "/tmp/worktrees/NIN-42",
      createIssue(),
    );

    expect(result).toEqual({ branchName: "risoluto/nin-42" });
    expect(calls).toEqual([
      ["rev-parse", "--git-dir"],
      ["fetch", "origin", "--prune"],
      ["fetch", "origin", "--prune"],
      ["rev-parse", "--verify", "refs/heads/risoluto/nin-42"],
      ["worktree", "add", "/tmp/worktrees/NIN-42", "risoluto/nin-42"],
    ]);
  });

  it("syncs a worktree base clone", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    await manager.syncWorktree("/tmp/base/backend.git");

    expect(calls).toEqual([["fetch", "origin", "--prune"]]);
  });

  it("removes a worktree with force by default", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    await manager.removeWorktree("/tmp/base/backend.git", "/tmp/worktrees/NIN-42");

    expect(calls).toEqual([
      ["worktree", "remove", "--force", "/tmp/worktrees/NIN-42"],
      ["worktree", "prune"],
    ]);
  });

  it("derives the base clone directory from the repo URL", () => {
    const manager = new GitManager({ env: {} });

    expect(manager.deriveBaseCloneDir("/tmp/risoluto", "https://github.com/acme/backend.git")).toBe(
      "/tmp/risoluto/.base/https-github.com-acme-backend.git",
    );
  });

  it("skips commit and push when there are no staged changes", async () => {
    const runGit: GitRunner = async (args) => {
      if (args[0] === "status") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "rev-parse") {
        return { stdout: "feature/current\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.commitAndPush("/tmp/ws", "done");

    expect(result).toEqual({
      committed: false,
      pushed: false,
      branchName: "feature/current",
    });
  });

  it("adds, commits, and pushes when changes exist", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      if (args[0] === "status") {
        return { stdout: " M src/file.ts\n", stderr: "" };
      }
      if (args[0] === "rev-parse") {
        return { stdout: "risoluto/nin-42\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.commitAndPush("/tmp/ws", "feat: finish issue");

    expect(result).toEqual({
      committed: true,
      pushed: true,
      branchName: "risoluto/nin-42",
    });
    expect(calls).toEqual([
      ["status", "--porcelain"],
      ["rev-parse", "--abbrev-ref", "HEAD"],
      ["add", "-A"],
      ["commit", "-m", "feat: finish issue"],
      ["push", "-u", "origin", "risoluto/nin-42"],
    ]);
  });

  it("creates a pull request via GitHub API", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ number: 101, html_url: "https://github.com/acme/backend/pull/101" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );

    const manager = new GitManager({
      runGit: async () => ({ stdout: "", stderr: "" }),
      fetch: fetchMock as unknown as typeof fetch,
      env: { GITHUB_TOKEN: "ghs_test" },
    });

    const payload = await manager.createPullRequest(createRepoMatch(), createIssue(), "risoluto/nin-42");
    expect(payload).toMatchObject({ number: 101 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/backend/pulls",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer ghs_test",
        }),
      }),
    );
  });

  it("fails pull request creation when token is missing", async () => {
    const manager = new GitManager({
      runGit: async () => ({ stdout: "", stderr: "" }),
      env: {},
    });

    await expect(manager.createPullRequest(createRepoMatch(), createIssue(), "risoluto/nin-42")).rejects.toThrow(
      "missing GitHub token env var",
    );
  });

  it("wraps non-JSON GitHub error bodies in GitHubApiError instead of throwing SyntaxError", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("<html>Bad Gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    );

    const manager = new GitManager({
      runGit: async () => ({ stdout: "", stderr: "" }),
      fetch: fetchMock as unknown as typeof fetch,
      env: { GITHUB_TOKEN: "ghs_test" },
    });

    await expect(manager.createPullRequest(createRepoMatch(), createIssue(), "risoluto/nin-42")).rejects.toThrow(
      "github request failed with status 502",
    );
  });
});
