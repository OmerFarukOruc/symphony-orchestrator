import { describe, expect, it } from "vitest";

import { matchIssue, RepoRouter, type RepoRoute } from "../../src/git/repo-router.js";
import type { Issue } from "../../src/core/types.js";

function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "NIN-42",
    title: "Route me",
    description: null,
    priority: null,
    state: "Todo",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("repo-router", () => {
  it("returns null for empty or non-array route collections", () => {
    expect(matchIssue(createIssue(), [])).toBeNull();
    expect(matchIssue(createIssue(), null as unknown as RepoRoute[])).toBeNull();
    expect(matchIssue(createIssue(), {} as unknown as RepoRoute[])).toBeNull();
  });

  it("returns null for iterable non-array route collections even when they contain matching routes", () => {
    const iterableRoutes = {
      *[Symbol.iterator]() {
        yield { label: "repo:ops", repoUrl: "https://github.com/acme/ops.git" };
      },
    };

    expect(matchIssue(createIssue({ labels: ["repo:ops"] }), iterableRoutes as unknown as RepoRoute[])).toBeNull();
  });

  it("matches by label before identifier prefix when both match", () => {
    const routes: RepoRoute[] = [
      { identifierPrefix: "NIN", repoUrl: "https://github.com/acme/backend.git", defaultBranch: "main" },
      { label: " repo:frontend ", repoUrl: "https://github.com/acme/frontend.git", defaultBranch: " develop " },
    ];

    const match = matchIssue(createIssue({ labels: ["repo:frontend"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/frontend.git",
      matchedBy: "label",
      defaultBranch: "develop",
      label: "repo:frontend",
    });
  });

  it("matches labels case-insensitively and ignores surrounding whitespace on issue labels", () => {
    const routes: RepoRoute[] = [{ label: "repo:frontend", repoUrl: "https://github.com/acme/frontend.git" }];

    const match = matchIssue(createIssue({ labels: ["  RePo:FrOnTeNd  "] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/frontend.git",
      matchedBy: "label",
    });
  });

  it("matches by identifier prefix when no label route matches", () => {
    const routes: RepoRoute[] = [
      {
        identifierPrefix: " web ",
        repoUrl: "https://github.com/acme/frontend.git",
        defaultBranch: " develop ",
        githubOwner: " acme ",
        githubRepo: " frontend ",
        githubTokenEnv: " FRONTEND_TOKEN ",
      },
      { label: "repo:api", repoUrl: "https://github.com/acme/api.git" },
    ];

    const match = matchIssue(createIssue({ identifier: "WEB-7", labels: ["repo:frontend"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/frontend.git",
      matchedBy: "identifier_prefix",
      defaultBranch: "develop",
      identifierPrefix: "web",
      githubOwner: "acme",
      githubRepo: "frontend",
      githubTokenEnv: "FRONTEND_TOKEN",
    });
  });

  it("matches identifier prefixes case-insensitively and ignores surrounding whitespace", () => {
    const routes: RepoRoute[] = [{ identifierPrefix: "web", repoUrl: "https://github.com/acme/frontend.git" }];

    const match = matchIssue(createIssue({ identifier: "  WeB-7  " }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/frontend.git",
      matchedBy: "identifier_prefix",
    });
  });

  it("falls back to defaults when branch or token values are blank", () => {
    const routes: RepoRoute[] = [
      {
        identifierPrefix: "OPS",
        repoUrl: "https://github.com/acme/ops.git",
        defaultBranch: "   ",
        githubTokenEnv: "   ",
      },
    ];

    const match = matchIssue(createIssue({ identifier: "OPS-7" }), routes);
    expect(match).toMatchObject({
      defaultBranch: "main",
      githubTokenEnv: "GITHUB_TOKEN",
    });
  });

  it("skips label routes with blank repo URLs or blank labels", () => {
    const routes: RepoRoute[] = [
      { label: "repo:frontend", repoUrl: "   " },
      { label: "   ", repoUrl: "https://github.com/acme/blank.git" },
      { label: "repo:ops", repoUrl: "https://github.com/acme/ops.git" },
    ];

    const match = matchIssue(createIssue({ labels: ["repo:ops"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/ops.git",
      matchedBy: "label",
    });
  });

  it("skips a matching label route when repoUrl is missing or only whitespace", () => {
    const routes: RepoRoute[] = [
      { label: "repo:frontend", repoUrl: undefined },
      { label: "repo:frontend", repoUrl: "   " },
      { label: "repo:frontend", repoUrl: "https://github.com/acme/frontend.git" },
    ];

    const match = matchIssue(createIssue({ labels: ["repo:frontend"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/frontend.git",
      matchedBy: "label",
    });
  });

  it("skips a whitespace-only matching label instead of treating it as valid", () => {
    const routes: RepoRoute[] = [
      { label: "   ", repoUrl: "https://github.com/acme/blank.git" },
      { label: "repo:ops", repoUrl: "https://github.com/acme/ops.git" },
    ];

    const match = matchIssue(createIssue({ labels: ["   ", "repo:ops"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/ops.git",
      matchedBy: "label",
    });
  });

  it("skips identifier-prefix routes with blank repo URLs or blank prefixes", () => {
    const routes: RepoRoute[] = [
      { identifierPrefix: "WEB", repoUrl: "   " },
      { identifierPrefix: "   ", repoUrl: "https://github.com/acme/blank.git" },
      { identifierPrefix: "OPS", repoUrl: "https://github.com/acme/ops.git" },
    ];

    const match = matchIssue(createIssue({ identifier: "OPS-7" }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/ops.git",
      matchedBy: "identifier_prefix",
    });
  });

  it("skips a whitespace-only identifier prefix instead of treating it as valid", () => {
    const routes: RepoRoute[] = [
      { identifierPrefix: "   ", repoUrl: "https://github.com/acme/blank.git" },
      { identifierPrefix: "OPS", repoUrl: "https://github.com/acme/ops.git" },
    ];

    const match = matchIssue(createIssue({ identifier: "   -7" }), routes);
    expect(match).toBeNull();
  });

  it("skips a matching identifier-prefix route when repoUrl is missing or only whitespace", () => {
    const routes: RepoRoute[] = [
      { identifierPrefix: "OPS", repoUrl: undefined },
      { identifierPrefix: "OPS", repoUrl: "   " },
      { identifierPrefix: "OPS", repoUrl: "https://github.com/acme/ops.git" },
    ];

    const match = matchIssue(createIssue({ identifier: "OPS-7" }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/ops.git",
      matchedBy: "identifier_prefix",
    });
  });

  it("returns null when no route matches", () => {
    const routes: RepoRoute[] = [{ identifierPrefix: "API", repoUrl: "https://github.com/acme/api.git" }];
    const match = matchIssue(createIssue({ identifier: "WEB-7", labels: ["repo:frontend"] }), routes);
    expect(match).toBeNull();
  });

  it("class wrapper delegates to matchIssue", () => {
    const router = new RepoRouter([{ label: "repo:ops", repoUrl: "https://github.com/acme/ops.git" }]);
    const match = router.matchIssue(createIssue({ identifier: "OPS-10", labels: ["repo:ops"] }));
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/ops.git",
      matchedBy: "label",
    });
  });
});
