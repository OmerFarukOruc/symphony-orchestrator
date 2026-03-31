import { beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubPrClient, type GitHubPrClientDeps } from "../../src/git/github-pr-client.js";
import type { RepoMatch } from "../../src/git/repo-router.js";
import { createJsonResponse } from "../helpers.js";

function makeRoute(overrides: Partial<RepoMatch> = {}): RepoMatch {
  return {
    repoUrl: "https://github.com/acme/backend.git",
    defaultBranch: "main",
    githubOwner: "acme",
    githubRepo: "backend",
    githubTokenEnv: "GITHUB_TOKEN",
    matchedBy: "identifier_prefix",
    ...overrides,
  };
}

function makeIssue(overrides: Partial<{ identifier: string; title: string; url: string }> = {}) {
  return {
    identifier: "ENG-42",
    title: "Fix the widget",
    url: "https://linear.app/acme/issue/ENG-42",
    ...overrides,
  };
}

describe("GitHubPrClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let env: Record<string, string>;
  let deps: GitHubPrClientDeps;

  beforeEach(() => {
    mockFetch = vi.fn();
    env = { GITHUB_TOKEN: "ghp_test123" };
    deps = { fetch: mockFetch, env, apiBaseUrl: "https://api.github.com" };
  });

  // ── Constructor injection ────────────────────────────────────────────

  describe("constructor", () => {
    it("uses injected fetch, env, and apiBaseUrl", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(200, { number: 1 }));
      const client = new GitHubPrClient(deps);

      await client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1 });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/o/r/pulls/1",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("uses custom apiBaseUrl", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(200, { number: 1 }));
      const client = new GitHubPrClient({ ...deps, apiBaseUrl: "https://ghe.internal/api/v3" });

      await client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1 });

      expect(mockFetch).toHaveBeenCalledWith("https://ghe.internal/api/v3/repos/o/r/pulls/1", expect.anything());
    });

    it("uses custom defaultGithubTokenEnv", async () => {
      const customEnv = { MY_GH_TOKEN: "ghp_custom" };
      mockFetch.mockResolvedValueOnce(createJsonResponse(200, {}));
      const client = new GitHubPrClient({
        fetch: mockFetch,
        env: customEnv,
        defaultGithubTokenEnv: "MY_GH_TOKEN",
      });

      await client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer ghp_custom" }),
        }),
      );
    });

    it("throws when token env var is missing", async () => {
      const client = new GitHubPrClient({ fetch: mockFetch, env: {} });

      await expect(client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1 })).rejects.toThrow(
        "missing GitHub token env var: GITHUB_TOKEN",
      );
    });
  });

  // ── createPullRequest ────────────────────────────────────────────────

  describe("createPullRequest", () => {
    it("creates a PR and returns the response", async () => {
      const prData = { number: 99, html_url: "https://github.com/acme/backend/pull/99" };
      mockFetch.mockResolvedValueOnce(createJsonResponse(201, prData));
      const client = new GitHubPrClient(deps);

      const result = await client.createPullRequest(makeRoute(), makeIssue(), "eng-42-fix-widget");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/acme/backend/pulls",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            title: "ENG-42: Fix the widget",
            head: "eng-42-fix-widget",
            base: "main",
            body: "Source issue: https://linear.app/acme/issue/ENG-42",
          }),
        }),
      );
      expect(result).toEqual(prData);
    });

    it("omits body field when issue has no URL", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(201, { number: 1 }));
      const client = new GitHubPrClient(deps);

      await client.createPullRequest(makeRoute(), makeIssue({ url: "" }), "branch");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.body).toBeUndefined();
    });

    it("derives owner/repo from repoUrl when github fields are absent", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(201, { number: 1 }));
      const client = new GitHubPrClient(deps);
      const route = makeRoute({
        githubOwner: undefined,
        githubRepo: undefined,
        repoUrl: "https://github.com/derived-org/derived-repo.git",
      });

      await client.createPullRequest(route, makeIssue(), "branch");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/derived-org/derived-repo/pulls",
        expect.anything(),
      );
    });

    it("derives owner/repo from SSH repoUrl", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(201, { number: 1 }));
      const client = new GitHubPrClient(deps);
      const route = makeRoute({
        githubOwner: undefined,
        githubRepo: undefined,
        repoUrl: "git@github.com:ssh-org/ssh-repo.git",
      });

      await client.createPullRequest(route, makeIssue(), "branch");

      expect(mockFetch).toHaveBeenCalledWith("https://api.github.com/repos/ssh-org/ssh-repo/pulls", expect.anything());
    });

    it("throws when owner/repo cannot be derived", async () => {
      const client = new GitHubPrClient(deps);
      const route = makeRoute({
        githubOwner: undefined,
        githubRepo: undefined,
        repoUrl: "not-a-github-url",
      });

      await expect(client.createPullRequest(route, makeIssue(), "branch")).rejects.toThrow(
        "unable to derive github owner/repo for pull request creation",
      );
    });

    it("falls back to existing PR on 422 duplicate error", async () => {
      const duplicatePayload = { message: "Validation Failed", errors: [{ message: "A pull request already exists" }] };
      const existingPr = { number: 50, html_url: "https://github.com/acme/backend/pull/50" };

      mockFetch
        .mockResolvedValueOnce(createJsonResponse(422, duplicatePayload))
        .mockResolvedValueOnce(createJsonResponse(200, [existingPr]));

      const client = new GitHubPrClient(deps);
      const result = await client.createPullRequest(makeRoute(), makeIssue(), "eng-42-fix-widget");

      expect(result).toEqual(existingPr);

      // Second call should be a GET for existing PRs
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[0]).toContain("/repos/acme/backend/pulls?head=acme:eng-42-fix-widget&state=open");
      expect(secondCall[1].method).toBe("GET");
    });

    it("returns undefined when duplicate fallback finds no existing PR", async () => {
      const duplicatePayload = { message: "Validation Failed", errors: [{ message: "A pull request already exists" }] };

      mockFetch
        .mockResolvedValueOnce(createJsonResponse(422, duplicatePayload))
        .mockResolvedValueOnce(createJsonResponse(200, []));

      const client = new GitHubPrClient(deps);
      const result = await client.createPullRequest(makeRoute(), makeIssue(), "branch");

      expect(result).toBeUndefined();
    });

    it("re-throws non-duplicate 422 errors", async () => {
      const payload = { message: "Validation Failed", errors: [{ message: "some other error" }] };
      mockFetch.mockResolvedValueOnce(createJsonResponse(422, payload));

      const client = new GitHubPrClient(deps);

      await expect(client.createPullRequest(makeRoute(), makeIssue(), "branch")).rejects.toThrow(
        /github request failed with status 422/,
      );
    });

    it("re-throws non-422 errors", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(500, { message: "Internal Server Error" }));

      const client = new GitHubPrClient(deps);

      await expect(client.createPullRequest(makeRoute(), makeIssue(), "branch")).rejects.toThrow(
        /github request failed with status 500/,
      );
    });

    it("uses route-level githubTokenEnv", async () => {
      const customEnv = { CUSTOM_TOKEN: "ghp_custom", GITHUB_TOKEN: "ghp_default" };
      mockFetch.mockResolvedValueOnce(createJsonResponse(201, { number: 1 }));
      const client = new GitHubPrClient({ ...deps, env: customEnv });
      const route = makeRoute({ githubTokenEnv: "CUSTOM_TOKEN" });

      await client.createPullRequest(route, makeIssue(), "branch");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer ghp_custom" }),
        }),
      );
    });

    it("sends correct headers including user-agent", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(201, { number: 1 }));
      const client = new GitHubPrClient(deps);

      await client.createPullRequest(makeRoute(), makeIssue(), "branch");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            "content-type": "application/json",
            authorization: "Bearer ghp_test123",
            "user-agent": "risoluto",
          },
        }),
      );
    });
  });

  // ── addPrComment ─────────────────────────────────────────────────────

  describe("addPrComment", () => {
    it("posts a comment and returns the response", async () => {
      const commentData = { id: 101, body: "LGTM" };
      mockFetch.mockResolvedValueOnce(createJsonResponse(201, commentData));
      const client = new GitHubPrClient(deps);

      const result = await client.addPrComment({
        owner: "acme",
        repo: "backend",
        pullNumber: 42,
        body: "LGTM",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/acme/backend/issues/42/comments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ body: "LGTM" }),
        }),
      );
      expect(result).toEqual(commentData);
    });

    it("uses custom tokenEnvName when provided", async () => {
      const customEnv = { CUSTOM_TOKEN: "ghp_special", GITHUB_TOKEN: "ghp_default" };
      mockFetch.mockResolvedValueOnce(createJsonResponse(201, { id: 1 }));
      const client = new GitHubPrClient({ ...deps, env: customEnv });

      await client.addPrComment({
        owner: "acme",
        repo: "backend",
        pullNumber: 1,
        body: "comment",
        tokenEnvName: "CUSTOM_TOKEN",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer ghp_special" }),
        }),
      );
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(403, { message: "Forbidden" }));
      const client = new GitHubPrClient(deps);

      await expect(client.addPrComment({ owner: "acme", repo: "backend", pullNumber: 1, body: "hi" })).rejects.toThrow(
        /github request failed with status 403/,
      );
    });
  });

  // ── getPrStatus ──────────────────────────────────────────────────────

  describe("getPrStatus", () => {
    it("returns PR status data", async () => {
      const prStatus = { state: "open", mergeable: true, merged: false };
      mockFetch.mockResolvedValueOnce(createJsonResponse(200, prStatus));
      const client = new GitHubPrClient(deps);

      const result = await client.getPrStatus({
        owner: "acme",
        repo: "backend",
        pullNumber: 7,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/acme/backend/pulls/7",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual(prStatus);
    });

    it("throws on 404", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse(404, { message: "Not Found" }));
      const client = new GitHubPrClient(deps);

      await expect(client.getPrStatus({ owner: "acme", repo: "backend", pullNumber: 999 })).rejects.toThrow(
        /github request failed with status 404/,
      );
    });

    it("uses custom tokenEnvName", async () => {
      const customEnv = { ORG_TOKEN: "ghp_org" };
      mockFetch.mockResolvedValueOnce(createJsonResponse(200, {}));
      const client = new GitHubPrClient({ ...deps, env: customEnv, defaultGithubTokenEnv: "ORG_TOKEN" });

      await client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1, tokenEnvName: "ORG_TOKEN" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer ghp_org" }),
        }),
      );
    });
  });

  // ── githubRequest internals (via public methods) ─────────────────────

  describe("githubRequest (response parsing)", () => {
    it("handles empty response body", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));
      const client = new GitHubPrClient(deps);

      const result = await client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1 });

      expect(result).toBeNull();
    });

    it("handles non-JSON text response on success", async () => {
      mockFetch.mockResolvedValueOnce(new Response("plain text", { status: 200 }));
      const client = new GitHubPrClient(deps);

      const result = await client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1 });

      expect(result).toBe("plain text");
    });

    it("includes non-JSON text in error payload on failure", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }));
      const client = new GitHubPrClient(deps);

      await expect(client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1 })).rejects.toThrow(
        /github request failed with status 503/,
      );
    });

    it("propagates network errors from fetch", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network timeout"));
      const client = new GitHubPrClient(deps);

      await expect(client.getPrStatus({ owner: "o", repo: "r", pullNumber: 1 })).rejects.toThrow("network timeout");
    });
  });
});
