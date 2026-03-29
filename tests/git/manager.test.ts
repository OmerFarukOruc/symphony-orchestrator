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

    expect(result.branchName).toBe("symphony/nin-42");
    expect(calls).toEqual([
      ["clone", "--branch", "main", "--single-branch", "https://github.com/acme/backend.git", "."],
      ["checkout", "-b", "symphony/nin-42"],
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
        return { stdout: "refs/heads/symphony/nin-42\n", stderr: "" };
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

    expect(result).toEqual({ branchName: "symphony/nin-42" });
    expect(calls).toEqual([
      ["rev-parse", "--git-dir"],
      ["fetch", "origin", "--prune"],
      ["fetch", "origin", "--prune"],
      ["rev-parse", "--verify", "refs/heads/symphony/nin-42"],
      ["worktree", "add", "/tmp/worktrees/NIN-42", "symphony/nin-42"],
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

    expect(manager.deriveBaseCloneDir("/tmp/symphony", "https://github.com/acme/backend.git")).toBe(
      "/tmp/symphony/.base/https-github.com-acme-backend.git",
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
        return { stdout: "symphony/nin-42\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };

    const manager = new GitManager({ runGit, env: {} });
    const result = await manager.commitAndPush("/tmp/ws", "feat: finish issue");

    expect(result).toEqual({
      committed: true,
      pushed: true,
      branchName: "symphony/nin-42",
    });
    expect(calls).toEqual([
      ["status", "--porcelain"],
      ["rev-parse", "--abbrev-ref", "HEAD"],
      ["add", "-A"],
      ["commit", "-m", "feat: finish issue"],
      ["push", "-u", "origin", "symphony/nin-42"],
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

    const payload = await manager.createPullRequest(createRepoMatch(), createIssue(), "symphony/nin-42");
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

    await expect(manager.createPullRequest(createRepoMatch(), createIssue(), "symphony/nin-42")).rejects.toThrow(
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

    await expect(manager.createPullRequest(createRepoMatch(), createIssue(), "symphony/nin-42")).rejects.toThrow(
      "github request failed with status 502",
    );
  });

  describe("deriveBranchName via cloneInto", () => {
    it("uses issue.branchName when present", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ branchName: "feature/custom-branch" });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue);

      expect(result.branchName).toBe("feature/custom-branch");
    });

    it("trims whitespace from branchName", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ branchName: "  feature/spaced  " });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue);

      expect(result.branchName).toBe("feature/spaced");
    });

    it("falls back to prefix + sanitized identifier when branchName is empty string", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ branchName: "" });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue);

      expect(result.branchName).toBe("symphony/nin-42");
    });

    it("falls back to prefix + sanitized identifier when branchName is whitespace-only", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ branchName: "   " });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue);

      expect(result.branchName).toBe("symphony/nin-42");
    });

    it("uses 'issue' slug when identifier sanitizes to empty string", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ identifier: "---", branchName: null });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue);

      expect(result.branchName).toBe("symphony/issue");
    });

    it("applies custom branchPrefix", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ branchName: null });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue, "feature/");

      expect(result.branchName).toBe("feature/nin-42");
    });
  });

  describe("sanitizeBranchSegment edge cases", () => {
    it("lowercases and normalizes special characters", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ identifier: "FOO BAR!@#$123", branchName: null });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue);

      // "FOO BAR!@#$123" -> lowercase -> "foo bar!@#$123" -> replace non-alnum -> "foo-bar-123"
      // -> collapse dashes -> "foo-bar-123" -> trim leading/trailing dashes
      expect(result.branchName).toBe("symphony/foo-bar-123");
    });

    it("strips leading and trailing dashes/slashes", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ identifier: "--/lead-trail/--", branchName: null });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue);

      expect(result.branchName).toBe("symphony/lead-trail");
    });

    it("collapses multiple consecutive dashes", async () => {
      const runGit: GitRunner = async () => ({ stdout: "", stderr: "" });

      const manager = new GitManager({ runGit, env: {} });
      const issue = createIssue({ identifier: "a---b", branchName: null });
      const result = await manager.cloneInto(createRepoMatch(), "/tmp/ws", issue);

      expect(result.branchName).toBe("symphony/a-b");
    });
  });

  describe("commitAndPush — token handling", () => {
    function createTrackingRunner(overrides?: Partial<Record<string, () => { stdout: string; stderr: string }>>) {
      const calls: string[][] = [];
      const runGit: GitRunner = async (args) => {
        calls.push(args);
        const cmd = args[0];
        if (cmd && overrides?.[cmd]) return overrides[cmd]!();
        if (cmd === "status") return { stdout: " M file.ts\n", stderr: "" };
        return { stdout: "", stderr: "" };
      };
      return { calls, runGit };
    }

    it("uses GITHUB_TOKEN for push auth when available", async () => {
      const { calls, runGit } = createTrackingRunner();

      const manager = new GitManager({
        runGit,
        env: { GITHUB_TOKEN: "ghp_testtoken123" },
      });

      await manager.commitAndPush("/tmp/ws", "fix: stuff", "main");

      const pushCall = calls.find((c) => c.includes("push"));
      expect(pushCall).toBeDefined();
      // Should include the -c http.extraHeader with auth
      expect(pushCall![0]).toBe("-c");
      expect(pushCall![1]).toContain("Authorization: Basic");
    });

    it("pushes without token header when token is not available", async () => {
      const { calls, runGit } = createTrackingRunner();

      const manager = new GitManager({ runGit, env: {} });

      await manager.commitAndPush("/tmp/ws", "fix: stuff", "main");

      const pushCall = calls.find((c) => c.includes("push"));
      expect(pushCall).toEqual(["push", "-u", "origin", "main"]);
    });

    it("uses custom tokenEnvName for push auth", async () => {
      const { calls, runGit } = createTrackingRunner();

      const manager = new GitManager({
        runGit,
        env: { CUSTOM_GH_TOKEN: "ghp_custom123" },
      });

      await manager.commitAndPush("/tmp/ws", "fix: stuff", "main", "CUSTOM_GH_TOKEN");

      const pushCall = calls.find((c) => c.includes("push"));
      expect(pushCall).toBeDefined();
      expect(pushCall![1]).toContain("Authorization: Basic");
    });

    it("uses provided branchName instead of resolving current branch", async () => {
      const { calls, runGit } = createTrackingRunner();

      const manager = new GitManager({ runGit, env: {} });
      const result = await manager.commitAndPush("/tmp/ws", "fix: stuff", "explicit-branch");

      expect(result.branchName).toBe("explicit-branch");
      // Should NOT have called rev-parse
      expect(calls.find((c) => c[0] === "rev-parse")).toBeUndefined();
    });

    it("resolves current branch when branchName is not provided", async () => {
      const { runGit } = createTrackingRunner({
        "rev-parse": () => ({ stdout: "auto-detected\n", stderr: "" }),
      });

      const manager = new GitManager({ runGit, env: {} });
      const result = await manager.commitAndPush("/tmp/ws", "fix: stuff");

      expect(result.branchName).toBe("auto-detected");
    });

    it("falls back to 'main' when rev-parse returns empty output", async () => {
      const runGit: GitRunner = async (args) => {
        if (args[0] === "status") return { stdout: " M file.ts\n", stderr: "" };
        if (args[0] === "rev-parse") return { stdout: "", stderr: "" };
        return { stdout: "", stderr: "" };
      };

      const manager = new GitManager({ runGit, env: {} });
      const result = await manager.commitAndPush("/tmp/ws", "fix: stuff");

      expect(result.branchName).toBe("main");
    });
  });

  describe("removeWorktree without force", () => {
    it("removes a worktree without --force when force is false", async () => {
      const calls: string[][] = [];
      const runGit: GitRunner = async (args) => {
        calls.push(args);
        return { stdout: "", stderr: "" };
      };

      const manager = new GitManager({ runGit, env: {} });
      await manager.removeWorktree("/tmp/base", "/tmp/worktrees/NIN-42", false);

      expect(calls).toEqual([
        ["worktree", "remove", "/tmp/worktrees/NIN-42"],
        ["worktree", "prune"],
      ]);
    });
  });

  describe("constructor defaults", () => {
    it("uses default GITHUB_TOKEN env var name", async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ number: 1 }), {
            status: 201,
            headers: { "content-type": "application/json" },
          }),
      );

      const manager = new GitManager({
        runGit: async () => ({ stdout: "", stderr: "" }),
        fetch: fetchMock as unknown as typeof fetch,
        env: { GITHUB_TOKEN: "ghp_default" },
      });

      await manager.createPullRequest(createRepoMatch(), createIssue(), "branch");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer ghp_default" }),
        }),
      );
    });

    it("uses custom defaultGithubTokenEnv", async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ number: 1 }), {
            status: 201,
            headers: { "content-type": "application/json" },
          }),
      );

      const manager = new GitManager({
        runGit: async () => ({ stdout: "", stderr: "" }),
        fetch: fetchMock as unknown as typeof fetch,
        env: { MY_TOKEN: "ghp_custom", GITHUB_TOKEN: "ghp_default" },
        defaultGithubTokenEnv: "MY_TOKEN",
      });

      // The PR client should use MY_TOKEN (the custom default), not GITHUB_TOKEN
      await manager.createPullRequest(createRepoMatch({ githubTokenEnv: "MY_TOKEN" }), createIssue(), "branch");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer ghp_custom" }),
        }),
      );
    });
  });
});
