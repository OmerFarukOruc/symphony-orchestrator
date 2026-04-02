import { describe, it, expect } from "vitest";
import { gitContextResponseSchema } from "../../src/http/response-schemas";

describe("gitContextResponseSchema", () => {
  const validGitContext = {
    repos: [
      {
        repoUrl: "https://github.com/org/repo",
        defaultBranch: "main",
        identifierPrefix: "ENG",
        label: null,
        githubOwner: "org",
        githubRepo: "repo",
        configured: true,
      },
    ],
    activeBranches: [],
    githubAvailable: true,
  };

  it("parses a valid git context response", () => {
    const result = gitContextResponseSchema.parse(validGitContext);
    expect(result.repos).toHaveLength(1);
    expect(result.githubAvailable).toBe(true);
  });

  it("parses with github enrichment", () => {
    const result = gitContextResponseSchema.parse({
      ...validGitContext,
      repos: [
        {
          ...validGitContext.repos[0],
          github: {
            description: "A test repo",
            visibility: "private",
            openPrCount: 2,
            pulls: [
              {
                number: 1,
                title: "PR 1",
                author: "dev",
                state: "open",
                updatedAt: "2026-04-01T00:00:00Z",
                url: "https://github.com/org/repo/pull/1",
                headBranch: "feature/1",
                checksStatus: null,
              },
            ],
            recentCommits: [{ sha: "abc1234", message: "fix: something", author: "dev", date: "2026-04-01T00:00:00Z" }],
          },
        },
      ],
    });
    expect(result.repos[0].github?.openPrCount).toBe(2);
  });

  it("parses with active branches", () => {
    const result = gitContextResponseSchema.parse({
      ...validGitContext,
      activeBranches: [
        {
          identifier: "ENG-1",
          branchName: "fix/bug-1",
          status: "running",
          workspacePath: "/tmp/ws-1",
          issueTitle: "Fix bug",
          pullRequestUrl: null,
        },
      ],
    });
    expect(result.activeBranches).toHaveLength(1);
    expect(result.activeBranches[0].branchName).toBe("fix/bug-1");
  });

  it("rejects missing repos", () => {
    const { repos: _, ...incomplete } = validGitContext;
    expect(gitContextResponseSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects missing githubAvailable", () => {
    const { githubAvailable: _, ...incomplete } = validGitContext;
    expect(gitContextResponseSchema.safeParse(incomplete).success).toBe(false);
  });
});
