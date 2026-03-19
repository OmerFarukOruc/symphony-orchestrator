import { describe, expect, it, vi } from "vitest";

import { executeGitPostRun } from "../../src/orchestrator/git-post-run.js";
import type { Issue, Workspace } from "../../src/core/types.js";
import type { RepoMatch } from "../../src/git/repo-router.js";

function makeIssue(): Issue {
  return {
    id: "issue-1",
    identifier: "MT-42",
    title: "Fix the bug",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: "mt-42-fix-the-bug",
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function makeWorkspace(): Workspace {
  return { path: "/tmp/ws/MT-42", workspaceKey: "ws-key", createdNow: true };
}

function makeRepoMatch(): RepoMatch {
  return {
    repoUrl: "https://github.com/org/repo",
    defaultBranch: "main",
    identifierPrefix: "MT",
    label: null,
    githubOwner: "org",
    githubRepo: "repo",
    githubTokenEnv: null,
  };
}

describe("executeGitPostRun", () => {
  it("returns null pullRequestUrl when nothing was pushed", async () => {
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: false, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn(),
    };
    const result = await executeGitPostRun(gitManager, makeWorkspace(), makeIssue(), makeRepoMatch());
    expect(result).toEqual({ pullRequestUrl: null });
    expect(gitManager.createPullRequest).not.toHaveBeenCalled();
  });

  it("returns pullRequestUrl when pushed and PR created with html_url", async () => {
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    const result = await executeGitPostRun(gitManager, makeWorkspace(), makeIssue(), makeRepoMatch());
    expect(result).toEqual({ pullRequestUrl: "https://github.com/org/repo/pull/99" });
  });

  it("passes correct commit message to commitAndPush", async () => {
    const issue = makeIssue();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: false, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn(),
    };
    await executeGitPostRun(gitManager, makeWorkspace(), issue, makeRepoMatch());
    expect(gitManager.commitAndPush).toHaveBeenCalledWith(
      makeWorkspace().path,
      `${issue.identifier}: ${issue.title}`,
      undefined,
      makeRepoMatch().githubTokenEnv,
    );
  });

  it("returns null pullRequestUrl when PR response has no html_url", async () => {
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ number: 99 }), // no html_url
    };
    const result = await executeGitPostRun(gitManager, makeWorkspace(), makeIssue(), makeRepoMatch());
    expect(result).toEqual({ pullRequestUrl: null });
  });

  it("returns null pullRequestUrl when PR response html_url is not a string", async () => {
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: 123 }),
    };
    const result = await executeGitPostRun(gitManager, makeWorkspace(), makeIssue(), makeRepoMatch());
    expect(result).toEqual({ pullRequestUrl: null });
  });

  it("propagates errors from commitAndPush", async () => {
    const gitManager = {
      commitAndPush: vi.fn().mockRejectedValue(new Error("git push failed")),
      createPullRequest: vi.fn(),
    };
    await expect(executeGitPostRun(gitManager, makeWorkspace(), makeIssue(), makeRepoMatch())).rejects.toThrow(
      "git push failed",
    );
  });

  it("propagates errors from createPullRequest", async () => {
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42" }),
      createPullRequest: vi.fn().mockRejectedValue(new Error("GitHub API error")),
    };
    await expect(executeGitPostRun(gitManager, makeWorkspace(), makeIssue(), makeRepoMatch())).rejects.toThrow(
      "GitHub API error",
    );
  });
});
