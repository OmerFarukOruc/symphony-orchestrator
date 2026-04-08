import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubIssuesClient, GitHubIssuesClientError } from "../../src/github/issues-client.js";
import { createJsonResponse, createMockLogger } from "../helpers.js";
import type { ServiceConfig } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createConfig(overrides: Record<string, unknown> = {}): ServiceConfig {
  return {
    tracker: {
      kind: "github",
      apiKey: "",
      endpoint: "https://api.github.com",
      projectSlug: null,
      owner: "acme",
      repo: "widgets",
      activeStates: ["in-progress"],
      terminalStates: ["done"],
    },
    github: { token: "ghp_test123" },
    ...overrides,
  } as unknown as ServiceConfig;
}

// ---------------------------------------------------------------------------
// Tests — mutation methods and edge cases
// ---------------------------------------------------------------------------

describe("GitHubIssuesClient (extended coverage)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createClient(configOverrides: Record<string, unknown> = {}): GitHubIssuesClient {
    return new GitHubIssuesClient(() => createConfig(configOverrides), createMockLogger());
  }

  // --- addLabel ---

  describe("addLabel", () => {
    it("sends POST with correct URL and label payload", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, [{ name: "bug" }]));
      const client = createClient();

      await client.addLabel(42, "bug");

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.github.com/repos/acme/widgets/issues/42/labels");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body as string)).toEqual({ labels: ["bug"] });
    });
  });

  // --- removeLabel ---

  describe("removeLabel", () => {
    it("sends DELETE with URL-encoded label name", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      const client = createClient();

      await client.removeLabel(42, "priority:high");

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.github.com/repos/acme/widgets/issues/42/labels/priority%3Ahigh");
      expect(opts.method).toBe("DELETE");
    });
  });

  // --- closeIssue ---

  describe("closeIssue", () => {
    it("sends PATCH with state closed", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, {}));
      const client = createClient();

      await client.closeIssue(7);

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.github.com/repos/acme/widgets/issues/7");
      expect(opts.method).toBe("PATCH");
      expect(JSON.parse(opts.body as string)).toEqual({ state: "closed" });
    });
  });

  // --- reopenIssue ---

  describe("reopenIssue", () => {
    it("sends PATCH with state open", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, {}));
      const client = createClient();

      await client.reopenIssue(7);

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(opts.method).toBe("PATCH");
      expect(JSON.parse(opts.body as string)).toEqual({ state: "open" });
    });
  });

  // --- createComment ---

  describe("createComment", () => {
    it("sends POST with comment body", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, {}));
      const client = createClient();

      await client.createComment(42, "Looks great!");

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.github.com/repos/acme/widgets/issues/42/comments");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body as string)).toEqual({ body: "Looks great!" });
    });
  });

  // --- createIssue ---

  describe("createIssue", () => {
    it("creates an issue with title, body, and labels", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse(201, {
          number: 99,
          title: "New feature",
          body: "Details",
          state: "open",
          labels: [{ name: "auto" }],
          html_url: "https://github.com/acme/widgets/issues/99",
          created_at: "2026-04-08T10:00:00Z",
          updated_at: "2026-04-08T10:00:00Z",
        }),
      );
      const client = createClient();

      const result = await client.createIssue({ title: "New feature", body: "Details", labels: ["auto"] });

      expect(result.number).toBe(99);
      expect(result.title).toBe("New feature");
    });

    it("uses empty labels and undefined body by default", async () => {
      fetchMock.mockResolvedValueOnce(
        createJsonResponse(201, {
          number: 100,
          title: "Minimal",
          body: null,
          state: "open",
          labels: [],
          html_url: "",
          created_at: "",
          updated_at: "",
        }),
      );
      const client = createClient();

      await client.createIssue({ title: "Minimal" });

      const sent = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<
        string,
        unknown
      >;
      expect(sent.body).toBeUndefined();
      expect(sent.labels).toEqual([]);
    });
  });

  // --- 204 handling ---

  describe("204 no-content response", () => {
    it("returns undefined for 204 responses", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      const client = createClient();

      const result = await client.removeLabel(10, "bugfix");
      expect(result).toBeUndefined();
    });
  });

  // --- invalid JSON ---

  describe("invalid JSON body", () => {
    it("throws github_unknown_payload on malformed JSON response", async () => {
      fetchMock.mockResolvedValueOnce(new Response("not json {{{", { status: 200 }));
      const client = createClient();

      try {
        await client.fetchOpenIssues();
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubIssuesClientError);
        expect((error as GitHubIssuesClientError).code).toBe("github_unknown_payload");
      }
    });
  });

  // --- config edge cases ---

  describe("configuration edge cases", () => {
    it("falls back to GITHUB_TOKEN env var when config github.token is missing", async () => {
      const saved = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = "env_fallback_token";

      const client = new GitHubIssuesClient(
        () => ({ tracker: { owner: "acme", repo: "widgets", endpoint: "" }, github: {} }) as never,
        createMockLogger(),
      );
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, []));
      await client.fetchOpenIssues();

      const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer env_fallback_token");

      if (saved === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = saved;
    });

    it("uses empty string token when no config and no env var", async () => {
      const saved = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const client = new GitHubIssuesClient(
        () => ({ tracker: { owner: "acme", repo: "widgets", endpoint: "" } }) as never,
        createMockLogger(),
      );
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, []));
      await client.fetchOpenIssues();

      const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer ");

      if (saved !== undefined) process.env.GITHUB_TOKEN = saved;
    });

    it("uses custom endpoint from tracker config", async () => {
      const client = new GitHubIssuesClient(
        () =>
          ({
            tracker: { owner: "acme", repo: "widgets", endpoint: "https://ghes.example.com/api/v3" },
            github: { token: "tok" },
          }) as never,
        createMockLogger(),
      );
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, []));
      await client.fetchOpenIssues();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toMatch(/^https:\/\/ghes\.example\.com\/api\/v3\/repos/);
    });

    it("defaults to api.github.com when endpoint is empty string", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, []));
      const client = createClient();
      await client.fetchOpenIssues();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toMatch(/^https:\/\/api\.github\.com/);
    });
  });

  // --- retry wrappers ---

  describe("retry wrappers", () => {
    it("withRetry delegates to shared utility", async () => {
      const client = createClient();
      const fn = vi.fn().mockResolvedValue(undefined);
      await client.withRetry("test", fn);
      expect(fn).toHaveBeenCalled();
    });

    it("withRetryReturn returns the function result", async () => {
      const client = createClient();
      const fn = vi.fn().mockResolvedValue(42);
      const result = await client.withRetryReturn("test", fn);
      expect(result).toBe(42);
    });
  });

  // --- fetchOpenIssues labels ---

  describe("fetchOpenIssues label filter", () => {
    it("omits labels param when labels is undefined", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, []));
      const client = createClient();
      await client.fetchOpenIssues(undefined);

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).not.toContain("labels=");
    });

    it("omits labels param when labels is empty array", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse(200, []));
      const client = createClient();
      await client.fetchOpenIssues([]);

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).not.toContain("labels=");
    });
  });
});
