import { describe, expect, it } from "vitest";

import { matchIssue, RepoRouter, type RepoRoute } from "../src/repo-router.js";
import type { Issue } from "../src/types.js";

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
  it("matches by identifier prefix first", () => {
    const routes: RepoRoute[] = [
      { identifierPrefix: "NIN", repoUrl: "https://github.com/acme/backend.git", defaultBranch: "main" },
      { label: "repo:frontend", repoUrl: "https://github.com/acme/frontend.git", defaultBranch: "develop" },
    ];

    const match = matchIssue(createIssue({ labels: ["repo:frontend"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/backend.git",
      matchedBy: "identifier_prefix",
      defaultBranch: "main",
    });
  });

  it("matches by label when identifier prefix does not match", () => {
    const routes: RepoRoute[] = [
      { identifierPrefix: "API", repoUrl: "https://github.com/acme/api.git" },
      { label: "repo:frontend", repoUrl: "https://github.com/acme/frontend.git", defaultBranch: "develop" },
    ];

    const match = matchIssue(createIssue({ identifier: "WEB-7", labels: ["repo:frontend"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/frontend.git",
      matchedBy: "label",
      defaultBranch: "develop",
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
