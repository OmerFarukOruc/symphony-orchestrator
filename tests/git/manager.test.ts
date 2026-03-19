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
});
