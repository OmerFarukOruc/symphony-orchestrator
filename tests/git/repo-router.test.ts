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
  it("matches by label before identifier prefix when both match", () => {
    const routes: RepoRoute[] = [
      { identifierPrefix: "NIN", repoUrl: "https://github.com/acme/backend.git", defaultBranch: "main" },
      { label: "repo:frontend", repoUrl: "https://github.com/acme/frontend.git", defaultBranch: "develop" },
    ];

    const match = matchIssue(createIssue({ labels: ["repo:frontend"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/frontend.git",
      matchedBy: "label",
      defaultBranch: "develop",
    });
  });

  it("matches by identifier prefix when no label route matches", () => {
    const routes: RepoRoute[] = [
      { identifierPrefix: "WEB", repoUrl: "https://github.com/acme/frontend.git", defaultBranch: "develop" },
      { label: "repo:api", repoUrl: "https://github.com/acme/api.git" },
    ];

    const match = matchIssue(createIssue({ identifier: "WEB-7", labels: ["repo:frontend"] }), routes);
    expect(match).toMatchObject({
      repoUrl: "https://github.com/acme/frontend.git",
      matchedBy: "identifier_prefix",
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

  it("returns null for empty routes array", () => {
    expect(matchIssue(createIssue(), [])).toBeNull();
  });

  it("returns null for non-array routes", () => {
    expect(matchIssue(createIssue(), null as unknown as RepoRoute[])).toBeNull();
  });

  it("skips label routes with empty repoUrl", () => {
    const routes: RepoRoute[] = [{ label: "repo:frontend", repoUrl: "" }];
    expect(matchIssue(createIssue({ labels: ["repo:frontend"] }), routes)).toBeNull();
  });

  it("skips label routes with whitespace-only repoUrl", () => {
    const routes: RepoRoute[] = [{ label: "repo:frontend", repoUrl: "   " }];
    expect(matchIssue(createIssue({ labels: ["repo:frontend"] }), routes)).toBeNull();
  });

  it("skips label routes with missing label property", () => {
    const routes: RepoRoute[] = [{ repoUrl: "https://github.com/acme/app.git" }];
    expect(matchIssue(createIssue({ labels: ["anything"] }), routes)).toBeNull();
  });

  it("skips identifier routes with empty repoUrl", () => {
    const routes: RepoRoute[] = [{ identifierPrefix: "NIN", repoUrl: "" }];
    expect(matchIssue(createIssue(), routes)).toBeNull();
  });

  it("skips identifier routes with whitespace-only repoUrl", () => {
    const routes: RepoRoute[] = [{ identifierPrefix: "NIN", repoUrl: "   " }];
    expect(matchIssue(createIssue(), routes)).toBeNull();
  });

  it("skips identifier routes with missing identifierPrefix", () => {
    const routes: RepoRoute[] = [{ repoUrl: "https://github.com/acme/app.git" }];
    expect(matchIssue(createIssue(), routes)).toBeNull();
  });

  it("skips identifier routes with whitespace-only identifierPrefix", () => {
    const routes: RepoRoute[] = [{ identifierPrefix: "  ", repoUrl: "https://github.com/acme/app.git" }];
    expect(matchIssue(createIssue(), routes)).toBeNull();
  });

  it("matches labels case-insensitively", () => {
    const routes: RepoRoute[] = [{ label: "REPO:FRONTEND", repoUrl: "https://github.com/acme/frontend.git" }];
    const match = matchIssue(createIssue({ labels: ["repo:frontend"] }), routes);
    expect(match).toMatchObject({ matchedBy: "label" });
  });

  it("matches identifier prefix case-insensitively", () => {
    const routes: RepoRoute[] = [{ identifierPrefix: "nin", repoUrl: "https://github.com/acme/app.git" }];
    const match = matchIssue(createIssue({ identifier: "NIN-42" }), routes);
    expect(match).toMatchObject({ matchedBy: "identifier_prefix" });
  });

  it("extracts issue prefix from identifier using first '-' delimiter", () => {
    const routes: RepoRoute[] = [{ identifierPrefix: "WEB", repoUrl: "https://github.com/acme/web.git" }];
    const match = matchIssue(createIssue({ identifier: "WEB-123-extra" }), routes);
    expect(match).toMatchObject({ matchedBy: "identifier_prefix" });
  });

  describe("toMatch defaults", () => {
    it("uses 'main' as defaultBranch when not specified", () => {
      const routes: RepoRoute[] = [{ label: "repo:app", repoUrl: "https://github.com/acme/app.git" }];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.defaultBranch).toBe("main");
    });

    it("uses 'main' as defaultBranch when empty string", () => {
      const routes: RepoRoute[] = [
        { label: "repo:app", repoUrl: "https://github.com/acme/app.git", defaultBranch: "" },
      ];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.defaultBranch).toBe("main");
    });

    it("uses 'main' as defaultBranch when whitespace-only", () => {
      const routes: RepoRoute[] = [
        { label: "repo:app", repoUrl: "https://github.com/acme/app.git", defaultBranch: "  " },
      ];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.defaultBranch).toBe("main");
    });

    it("trims and uses specified defaultBranch", () => {
      const routes: RepoRoute[] = [
        { label: "repo:app", repoUrl: "https://github.com/acme/app.git", defaultBranch: " develop " },
      ];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.defaultBranch).toBe("develop");
    });

    it("uses 'GITHUB_TOKEN' as default githubTokenEnv", () => {
      const routes: RepoRoute[] = [{ label: "repo:app", repoUrl: "https://github.com/acme/app.git" }];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.githubTokenEnv).toBe("GITHUB_TOKEN");
    });

    it("uses 'GITHUB_TOKEN' as githubTokenEnv when empty string", () => {
      const routes: RepoRoute[] = [
        { label: "repo:app", repoUrl: "https://github.com/acme/app.git", githubTokenEnv: "" },
      ];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.githubTokenEnv).toBe("GITHUB_TOKEN");
    });

    it("trims and uses custom githubTokenEnv", () => {
      const routes: RepoRoute[] = [
        { label: "repo:app", repoUrl: "https://github.com/acme/app.git", githubTokenEnv: " MY_TOKEN " },
      ];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.githubTokenEnv).toBe("MY_TOKEN");
    });

    it("trims identifierPrefix in match result", () => {
      const routes: RepoRoute[] = [{ identifierPrefix: " NIN ", repoUrl: "https://github.com/acme/app.git" }];
      const match = matchIssue(createIssue(), routes);
      expect(match!.identifierPrefix).toBe("NIN");
    });

    it("trims label in match result", () => {
      const routes: RepoRoute[] = [{ label: " repo:app ", repoUrl: "https://github.com/acme/app.git" }];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.label).toBe("repo:app");
    });

    it("trims and returns githubOwner when specified", () => {
      const routes: RepoRoute[] = [
        {
          label: "repo:app",
          repoUrl: "https://github.com/acme/app.git",
          githubOwner: " acme ",
          githubRepo: " app ",
        },
      ];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.githubOwner).toBe("acme");
      expect(match!.githubRepo).toBe("app");
    });

    it("returns undefined for githubOwner/githubRepo when empty string", () => {
      const routes: RepoRoute[] = [
        { label: "repo:app", repoUrl: "https://github.com/acme/app.git", githubOwner: "", githubRepo: "" },
      ];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.githubOwner).toBeUndefined();
      expect(match!.githubRepo).toBeUndefined();
    });

    it("returns undefined for githubOwner/githubRepo when whitespace-only", () => {
      const routes: RepoRoute[] = [
        { label: "repo:app", repoUrl: "https://github.com/acme/app.git", githubOwner: "  ", githubRepo: "  " },
      ];
      const match = matchIssue(createIssue({ labels: ["repo:app"] }), routes);
      expect(match!.githubOwner).toBeUndefined();
      expect(match!.githubRepo).toBeUndefined();
    });
  });
});
