import { describe, expect, it, vi } from "vitest";

import { GitManager, type GitRunner } from "../../src/git/manager.js";
import type { RepoMatch } from "../../src/git/repo-router.js";
import type { Issue } from "../../src/core/types.js";

function createCommitAndPushRunner(calls: string[][]): GitRunner {
  return async (args) => {
    calls.push(args);
    if (args[0] === "status") {
      return { stdout: " M src/file.ts\n", stderr: "" };
    }
    if (args[0] === "rev-parse") {
      if (args[1] === "--abbrev-ref") {
        return { stdout: "risoluto/nin-42\n", stderr: "" };
      }
      return { stdout: "abc123\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
}

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

  it("sanitizes issue identifiers into stable branch slugs", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", createIssue({ identifier: "  /NIN 42??/ " }));

    expect(result.branchName).toBe("risoluto/nin-42");
    expect(calls[1]).toEqual(["checkout", "-b", "risoluto/nin-42"]);
  });

  it("collapses repeated internal hyphens when deriving a branch slug", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", createIssue({ identifier: "NIN---42" }));

    expect(result.branchName).toBe("risoluto/nin-42");
    expect(calls[1]).toEqual(["checkout", "-b", "risoluto/nin-42"]);
  });

  it("strips repeated leading separators when deriving a branch slug", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", createIssue({ identifier: "///NIN-42" }));

    expect(result.branchName).toBe("risoluto/nin-42");
    expect(calls[1]).toEqual(["checkout", "-b", "risoluto/nin-42"]);
  });

  it("falls back to the issue slug when sanitization removes the identifier entirely", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", createIssue({ identifier: "///" }));

    expect(result.branchName).toBe("risoluto/issue");
    expect(calls[1]).toEqual(["checkout", "-b", "risoluto/issue"]);
  });

  it("prefers a trimmed explicit branch name over the derived slug", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.cloneInto(
      createRepoMatch(),
      "/tmp/ws",
      createIssue({ branchName: " feature/custom " }),
    );

    expect(result.branchName).toBe("feature/custom");
    expect(calls[1]).toEqual(["checkout", "-b", "feature/custom"]);
  });

  it("ignores blank branch names and falls back to the derived slug", async () => {
    const calls: string[][] = [];
    const runGit: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.cloneInto(
      createRepoMatch(),
      "/tmp/ws",
      createIssue({ branchName: "   ", identifier: "NIN-99" }),
    );

    expect(result.branchName).toBe("risoluto/nin-99");
    expect(calls[1]).toEqual(["checkout", "-b", "risoluto/nin-99"]);
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

  it("reports whether a workspace has uncommitted changes", async () => {
    const manager = new GitManager({
      runGit: async (args) => {
        if (args[0] === "status") {
          return { stdout: " M src/file.ts\n", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
      env: {},
    });

    await expect(manager.hasUncommittedChanges("/tmp/ws")).resolves.toBe(true);
  });

  it("treats whitespace-only git status output as no changes", async () => {
    const manager = new GitManager({
      runGit: async (args) => {
        if (args[0] === "status") {
          return { stdout: "   \n", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
      env: {},
    });

    await expect(manager.hasUncommittedChanges("/tmp/ws")).resolves.toBe(false);
  });

  it("creates a no-verify rescue commit and returns the new sha", async () => {
    const calls: string[][] = [];
    const manager = new GitManager({
      runGit: async (args) => {
        calls.push(args);
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: "abc123\n", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
      env: {},
    });

    const sha = await manager.autoCommit("/tmp/ws", "[NIN-42] auto-commit: workspace cleanup preservation", {
      noVerify: true,
    });

    expect(sha).toBe("abc123");
    expect(calls).toEqual([
      ["add", "-A"],
      ["commit", "--no-verify", "-m", "[NIN-42] auto-commit: workspace cleanup preservation"],
      ["rev-parse", "HEAD"],
    ]);
  });

  it("adds, commits, and pushes when changes exist", async () => {
    const calls: string[][] = [];
    const runGit = createCommitAndPushRunner(calls);

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.commitAndPush("/tmp/ws", "feat: finish issue");

    expect(result).toEqual({
      committed: true,
      pushed: true,
      branchName: "risoluto/nin-42",
    });
    expect(calls).toEqual([
      ["rev-parse", "--abbrev-ref", "HEAD"],
      ["status", "--porcelain"],
      ["add", "-A"],
      ["commit", "-m", "feat: finish issue"],
      ["rev-parse", "HEAD"],
      ["push", "-u", "origin", "risoluto/nin-42"],
    ]);
  });

  it("pushes with an auth header when the configured token env var is present", async () => {
    const calls: string[][] = [];
    const token = "ghs_secret";
    const encodedAuth = Buffer.from(`x-access-token:${token}`).toString("base64");
    const runGit = createCommitAndPushRunner(calls);

    const manager = new GitManager({
      runGit,
      env: { GITHUB_TOKEN: token },
    });
    const result = await manager.commitAndPush("/tmp/ws", "feat: finish issue");

    expect(result).toEqual({
      committed: true,
      pushed: true,
      branchName: "risoluto/nin-42",
    });
    expect(calls.at(-1)).toEqual([
      "-c",
      `http.extraHeader=Authorization: Basic ${encodedAuth}`,
      "push",
      "-u",
      "origin",
      "risoluto/nin-42",
    ]);
  });

  it("uses the explicit token env name when provided for commitAndPush", async () => {
    const calls: string[][] = [];
    const token = "ghs_alt_secret";
    const encodedAuth = Buffer.from(`x-access-token:${token}`).toString("base64");
    const runGit = createCommitAndPushRunner(calls);

    const manager = new GitManager({
      runGit,
      env: { ALT_GITHUB_TOKEN: token },
    });
    await manager.commitAndPush("/tmp/ws", "feat: finish issue", undefined, "ALT_GITHUB_TOKEN");

    expect(calls.at(-1)).toEqual([
      "-c",
      `http.extraHeader=Authorization: Basic ${encodedAuth}`,
      "push",
      "-u",
      "origin",
      "risoluto/nin-42",
    ]);
  });

  it("falls back to main when the current branch output is blank", async () => {
    const runGit: GitRunner = async (args) => {
      if (args[0] === "status") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "rev-parse") {
        return { stdout: "   \n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.commitAndPush("/tmp/ws", "done");

    expect(result).toEqual({
      committed: false,
      pushed: false,
      branchName: "main",
    });
  });

  it("force-pushes an existing branch with lease protection", async () => {
    const calls: string[][] = [];
    const manager = new GitManager({
      runGit: async (args) => {
        calls.push(args);
        return { stdout: "", stderr: "" };
      },
      env: {},
    });

    await manager.forcePushIfBranchExists("risoluto/nin-42", "/tmp/ws");

    expect(calls).toEqual([["push", "--force-with-lease", "origin", "risoluto/nin-42"]]);
  });

  it("creates a pull request via GitHub API", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ number: 101, html_url: "https://github.com/acme/backend/pull/101", state: "open" }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        ),
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

  it("uses the default runGit implementation with provided env and stdout/stderr fallbacks", async () => {
    const execFileAsync = vi.fn().mockResolvedValue({});
    const execFileMock = vi.fn();
    const promisifyMock = vi.fn(() => execFileAsync);

    vi.resetModules();
    vi.doMock("node:child_process", () => ({ execFile: execFileMock }));
    vi.doMock("node:util", () => ({ promisify: promisifyMock }));

    const { GitManager: ReimportedGitManager } = await import("../../src/git/manager.js");
    const manager = new ReimportedGitManager({ env: { CUSTOM_ENV: "1" } });

    await expect(manager.hasUncommittedChanges("/tmp/ws")).resolves.toBe(false);
    await expect(
      (manager as unknown as { runGit: GitRunner }).runGit(["status", "--porcelain"], {
        cwd: "/tmp/ws",
        env: { CUSTOM_ENV: "1" },
      }),
    ).resolves.toEqual({ stdout: "", stderr: "" });

    expect(promisifyMock).toHaveBeenCalledWith(execFileMock);
    expect(execFileAsync).toHaveBeenCalledWith("git", ["status", "--porcelain"], {
      cwd: "/tmp/ws",
      env: { CUSTOM_ENV: "1" },
    });

    vi.doUnmock("node:child_process");
    vi.doUnmock("node:util");
    vi.resetModules();
  });
});
