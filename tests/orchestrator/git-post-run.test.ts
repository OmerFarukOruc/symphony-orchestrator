import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:util", () => ({
  // eslint-disable-next-line sonarjs/no-extra-arguments
  promisify: () => (cmd: string, args: string[], options?: { cwd?: string }) => mockedExecFileAsync(cmd, args, options),
}));
vi.mock("../../src/git/pr-summary-generator.js", () => ({
  generatePrSummary: vi.fn(),
}));
vi.mock("../../src/git/merge-policy.js", () => ({
  evaluateMergePolicy: vi.fn(),
}));

import { executeGitPostRun } from "../../src/orchestrator/git-post-run.js";
import type { Issue, MergePolicy, Workspace } from "../../src/core/types.js";
import { evaluateMergePolicy } from "../../src/git/merge-policy.js";
import { generatePrSummary } from "../../src/git/pr-summary-generator.js";
import type { RepoMatch } from "../../src/git/repo-router.js";

type ExecExpectation = {
  cmd: string;
  args: string[];
  cwd: string;
  stdout?: string;
  error?: Error;
};

type ExecFileAsyncFn = (
  cmd: string,
  args: string[],
  options?: {
    cwd?: string;
  },
) => Promise<{ stdout: string; stderr: string }>;

let execExpectations: ExecExpectation[] = [];
let mockedExecFileAsync: ExecFileAsyncFn = async () => ({ stdout: "", stderr: "" });

function setExecExpectations(expectations: ExecExpectation[]): void {
  execExpectations = [...expectations];
  mockedExecFileAsync = async (cmd, args, options = {}) => {
    const expectation = execExpectations.shift();
    expect(expectation).toBeDefined();
    expect(cmd).toBe(expectation!.cmd);
    expect(args).toEqual(expectation!.args);
    expect(options).toMatchObject({ cwd: expectation!.cwd });

    if (expectation!.error) {
      throw expectation!.error;
    }

    return { stdout: expectation!.stdout ?? "", stderr: "" };
  };
}

function expectNoPendingExecExpectations(): void {
  expect(execExpectations).toHaveLength(0);
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
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
    ...overrides,
  };
}

function makeWorkspace(): Workspace {
  return { path: "/tmp/ws/MT-42", workspaceKey: "ws-key", createdNow: true };
}

function makeRepoMatch(overrides: Partial<RepoMatch> = {}): RepoMatch {
  return {
    repoUrl: "https://github.com/org/repo",
    defaultBranch: "main",
    identifierPrefix: "MT",
    label: null,
    githubOwner: "org",
    githubRepo: "repo",
    githubTokenEnv: "GITHUB_TOKEN",
    ...overrides,
  };
}

function makePolicy(overrides: Partial<MergePolicy> = {}): MergePolicy {
  return {
    enabled: true,
    allowedPaths: [],
    requireLabels: [],
    excludeLabels: [],
    maxChangedFiles: null,
    maxDiffLines: null,
    ...overrides,
  };
}

function makeAutoMerge(overrides: Partial<{ policy: MergePolicy }> = {}) {
  return {
    policy: makePolicy(overrides.policy),
    client: {
      requestAutoMerge: vi.fn().mockResolvedValue(undefined),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
}

describe("executeGitPostRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setExecExpectations([]);
    vi.mocked(generatePrSummary).mockResolvedValue(null);
    vi.mocked(evaluateMergePolicy).mockReturnValue({ allowed: true });
  });

  it("returns null pullRequestUrl when nothing was pushed and skips summary generation", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: false, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn(),
    };

    const result = await executeGitPostRun(gitManager, workspace, issue, repoMatch);

    expect(result).toEqual({ pullRequestUrl: null, summary: null });
    expect(gitManager.createPullRequest).not.toHaveBeenCalled();
    expect(generatePrSummary).not.toHaveBeenCalled();
    expectNoPendingExecExpectations();
  });

  it("passes the generated summary into createPullRequest and returns it", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const summary = "- updated the post-run pipeline";
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    vi.mocked(generatePrSummary).mockResolvedValue(summary);

    const result = await executeGitPostRun(gitManager, workspace, issue, repoMatch);

    expect(generatePrSummary).toHaveBeenCalledWith(workspace.path, repoMatch.defaultBranch);
    expect(gitManager.createPullRequest).toHaveBeenCalledWith(repoMatch, issue, "mt-42-fix-the-bug", summary);
    expect(result).toEqual({ pullRequestUrl: "https://github.com/org/repo/pull/99", summary });
    expectNoPendingExecExpectations();
  });

  it("continues without a summary when summary generation fails", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    vi.mocked(generatePrSummary).mockRejectedValue(new Error("codex unavailable"));

    const result = await executeGitPostRun(gitManager, workspace, issue, repoMatch);

    expect(gitManager.createPullRequest).toHaveBeenCalledWith(repoMatch, issue, "mt-42-fix-the-bug", null);
    expect(result).toEqual({ pullRequestUrl: "https://github.com/org/repo/pull/99", summary: null });
    expectNoPendingExecExpectations();
  });

  it("parses git outputs and requests auto-merge when policy allows it", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue({ labels: ["ready"] });
    const repoMatch = makeRepoMatch();
    const autoMerge = makeAutoMerge();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    setExecExpectations([
      {
        cmd: "git",
        args: ["diff", "--name-only", "main...HEAD"],
        cwd: workspace.path,
        stdout: "  src/a.ts \n\n docs/notes.md \n",
      },
      {
        cmd: "git",
        args: ["diff", "--shortstat", "main...HEAD"],
        cwd: workspace.path,
        stdout: " 2 files changed, 12 insertions(+), 12 deletions(-)",
      },
    ]);

    await executeGitPostRun(gitManager, workspace, issue, repoMatch, autoMerge);

    expect(evaluateMergePolicy).toHaveBeenCalledWith(
      autoMerge.policy,
      ["src/a.ts", "docs/notes.md"],
      { additions: 12, deletions: 12 },
      ["ready"],
    );
    expect(autoMerge.client.requestAutoMerge).toHaveBeenCalledWith("org", "repo", 99, "squash", "GITHUB_TOKEN");
    expect(autoMerge.logger.info).toHaveBeenCalledWith(
      { issue_identifier: issue.identifier, pull_request_url: "https://github.com/org/repo/pull/99" },
      "auto-merge requested",
    );
    expectNoPendingExecExpectations();
  });

  it("logs the blocking reason when policy rejects auto-merge", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const autoMerge = makeAutoMerge();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    setExecExpectations([
      {
        cmd: "git",
        args: ["diff", "--name-only", "main...HEAD"],
        cwd: workspace.path,
        stdout: "docs/readme.md\n",
      },
      {
        cmd: "git",
        args: ["diff", "--shortstat", "main...HEAD"],
        cwd: workspace.path,
        stdout: " 1 file changed, 1 insertion(+)",
      },
    ]);
    vi.mocked(evaluateMergePolicy).mockReturnValue({
      allowed: false,
      reason: "outside allowed paths",
      blockedFiles: ["docs/readme.md"],
    });

    await executeGitPostRun(gitManager, workspace, issue, repoMatch, autoMerge);

    expect(autoMerge.client.requestAutoMerge).not.toHaveBeenCalled();
    expect(autoMerge.logger.info).toHaveBeenCalledWith(
      {
        issue_identifier: issue.identifier,
        pull_request_url: "https://github.com/org/repo/pull/99",
        reason: "outside allowed paths",
        blocked_files: ["docs/readme.md"],
      },
      "auto-merge blocked by policy",
    );
    expectNoPendingExecExpectations();
  });

  it("skips auto-merge when the PR URL does not contain a pull segment", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const autoMerge = makeAutoMerge();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "abcde123" }),
    };
    setExecExpectations([
      {
        cmd: "git",
        args: ["diff", "--name-only", "main...HEAD"],
        cwd: workspace.path,
        stdout: "src/a.ts\n",
      },
      {
        cmd: "git",
        args: ["diff", "--shortstat", "main...HEAD"],
        cwd: workspace.path,
        stdout: " 1 file changed, 1 insertion(+)",
      },
    ]);

    await executeGitPostRun(gitManager, workspace, issue, repoMatch, autoMerge);

    expect(autoMerge.client.requestAutoMerge).not.toHaveBeenCalled();
    expectNoPendingExecExpectations();
  });

  it("skips auto-merge when the parsed pull number is zero", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const autoMerge = makeAutoMerge();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/0" }),
    };
    setExecExpectations([
      {
        cmd: "git",
        args: ["diff", "--name-only", "main...HEAD"],
        cwd: workspace.path,
        stdout: "src/a.ts\n",
      },
      {
        cmd: "git",
        args: ["diff", "--shortstat", "main...HEAD"],
        cwd: workspace.path,
        stdout: " 1 file changed, 1 insertion(+)",
      },
    ]);

    await executeGitPostRun(gitManager, workspace, issue, repoMatch, autoMerge);

    expect(autoMerge.client.requestAutoMerge).not.toHaveBeenCalled();
    expectNoPendingExecExpectations();
  });

  it("skips auto-merge when repository metadata is missing", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch({ githubOwner: null });
    const autoMerge = makeAutoMerge();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    setExecExpectations([
      {
        cmd: "git",
        args: ["diff", "--name-only", "main...HEAD"],
        cwd: workspace.path,
        stdout: "src/a.ts\n",
      },
      {
        cmd: "git",
        args: ["diff", "--shortstat", "main...HEAD"],
        cwd: workspace.path,
        stdout: " 1 file changed, 1 insertion(+)",
      },
    ]);

    await executeGitPostRun(gitManager, workspace, issue, repoMatch, autoMerge);

    expect(autoMerge.client.requestAutoMerge).not.toHaveBeenCalled();
    expectNoPendingExecExpectations();
  });

  it("logs a warning when the auto-merge request fails", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const autoMerge = makeAutoMerge();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    autoMerge.client.requestAutoMerge.mockRejectedValue(new Error("not supported"));
    setExecExpectations([
      {
        cmd: "git",
        args: ["diff", "--name-only", "main...HEAD"],
        cwd: workspace.path,
        stdout: "src/a.ts\n",
      },
      {
        cmd: "git",
        args: ["diff", "--shortstat", "main...HEAD"],
        cwd: workspace.path,
        stdout: " 1 file changed, 1 insertion(+)",
      },
    ]);

    await executeGitPostRun(gitManager, workspace, issue, repoMatch, autoMerge);

    expect(autoMerge.logger.warn).toHaveBeenCalledWith(
      {
        issue_identifier: issue.identifier,
        pull_request_url: "https://github.com/org/repo/pull/99",
        error: "not supported",
      },
      "requestAutoMerge failed (non-fatal — repo may not support auto-merge)",
    );
    expectNoPendingExecExpectations();
  });

  it("logs a warning when policy evaluation itself throws", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const autoMerge = makeAutoMerge();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    setExecExpectations([
      {
        cmd: "git",
        args: ["diff", "--name-only", "main...HEAD"],
        cwd: workspace.path,
        stdout: "src/a.ts\n",
      },
      {
        cmd: "git",
        args: ["diff", "--shortstat", "main...HEAD"],
        cwd: workspace.path,
        stdout: " 1 file changed, 1 insertion(+)",
      },
    ]);
    vi.mocked(evaluateMergePolicy).mockImplementation(() => {
      throw new Error("policy blew up");
    });

    await executeGitPostRun(gitManager, workspace, issue, repoMatch, autoMerge);

    expect(autoMerge.logger.warn).toHaveBeenCalledWith(
      {
        issue_identifier: issue.identifier,
        error: "policy blew up",
      },
      "auto-merge policy evaluation failed (non-fatal)",
    );
    expectNoPendingExecExpectations();
  });

  it("falls back to empty changed files and zero diff stats when git commands fail", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const autoMerge = makeAutoMerge();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/99" }),
    };
    setExecExpectations([
      {
        cmd: "git",
        args: ["diff", "--name-only", "main...HEAD"],
        cwd: workspace.path,
        error: new Error("diff failed"),
      },
      {
        cmd: "git",
        args: ["diff", "--shortstat", "main...HEAD"],
        cwd: workspace.path,
        error: new Error("shortstat failed"),
      },
    ]);

    await executeGitPostRun(gitManager, workspace, issue, repoMatch, autoMerge);

    expect(evaluateMergePolicy).toHaveBeenCalledWith(
      autoMerge.policy,
      [],
      { additions: 0, deletions: 0 },
      issue.labels,
    );
    expectNoPendingExecExpectations();
  });

  it("returns null pullRequestUrl when PR response is undefined", async () => {
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: true, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn().mockResolvedValue(undefined),
    };

    const result = await executeGitPostRun(gitManager, makeWorkspace(), makeIssue(), makeRepoMatch());

    expect(result).toEqual({ pullRequestUrl: null, summary: null });
    expectNoPendingExecExpectations();
  });

  it("passes the exact commit message and token to commitAndPush", async () => {
    const workspace = makeWorkspace();
    const issue = makeIssue();
    const repoMatch = makeRepoMatch();
    const gitManager = {
      commitAndPush: vi.fn().mockResolvedValue({ pushed: false, branchName: "mt-42-fix-the-bug" }),
      createPullRequest: vi.fn(),
    };

    await executeGitPostRun(gitManager, workspace, issue, repoMatch);

    expect(gitManager.commitAndPush).toHaveBeenCalledWith(
      workspace.path,
      "MT-42: Fix the bug",
      undefined,
      "GITHUB_TOKEN",
    );
    expectNoPendingExecExpectations();
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
