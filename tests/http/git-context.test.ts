import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";

import { handleGitContext, type GitContextDeps } from "../../src/http/git-context.js";

function makeOrchestrator() {
  return {
    getSnapshot: vi.fn().mockReturnValue({
      generatedAt: "2024-01-01T00:00:00Z",
      counts: { running: 0, retrying: 0 },
      running: [
        {
          issueId: "i1",
          identifier: "MT-1",
          title: "Fix auth bug",
          branchName: "symphony/mt-1",
          workspacePath: "/workspaces/mt-1",
          pullRequestUrl: "https://github.com/acme/app/pull/42",
          state: "In Progress",
          status: "running",
        },
      ],
      retrying: [
        {
          issueId: "i2",
          identifier: "MT-2",
          title: "Update docs",
          branchName: "symphony/mt-2",
          workspacePath: "/workspaces/mt-2",
          pullRequestUrl: null,
          state: "In Progress",
          status: "retrying",
        },
      ],
      completed: [],
      queued: [],
      workflowColumns: [],
      codexTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
      rateLimits: null,
      recentEvents: [],
    }),
  };
}

function makeConfigStore(repos: unknown[] = []) {
  return {
    getConfig: vi.fn().mockReturnValue({
      repos,
      tracker: {},
      polling: { intervalMs: 60_000 },
      workspace: { root: "/tmp", hooks: {} },
      agent: {},
      codex: {},
      server: { port: 3000 },
    }),
  };
}

function makeSecretsStore(token: string | null = null) {
  return {
    get: vi.fn().mockImplementation((key: string) => (key === "GITHUB_TOKEN" ? token : null)),
  };
}

function createApp(deps: GitContextDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.get("/api/v1/git/context", async (req, res) => {
    await handleGitContext(deps, req, res);
  });
  return app;
}

describe("GET /api/v1/git/context", () => {
  describe("without GitHub token", () => {
    let server: http.Server;
    let port: number;

    beforeAll(async () => {
      const app = createApp({
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore([
          {
            repoUrl: "https://github.com/acme/app.git",
            defaultBranch: "main",
            identifierPrefix: "MT",
            githubOwner: "acme",
            githubRepo: "app",
          },
        ]) as never,
        secretsStore: makeSecretsStore(null) as never,
      });
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          port = (server.address() as { port: number }).port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    it("returns repos from config with githubAvailable=false", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/git/context`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.githubAvailable).toBe(false);

      const repos = body.repos as Array<Record<string, unknown>>;
      expect(repos).toHaveLength(1);
      expect(repos[0].githubOwner).toBe("acme");
      expect(repos[0].githubRepo).toBe("app");
      expect(repos[0].github).toBeUndefined();
    });

    it("returns active branches from orchestrator state", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/git/context`);
      const body = (await res.json()) as Record<string, unknown>;
      const branches = body.activeBranches as Array<Record<string, unknown>>;
      expect(branches).toHaveLength(2);
      expect(branches[0].identifier).toBe("MT-1");
      expect(branches[0].branchName).toBe("symphony/mt-1");
      expect(branches[0].status).toBe("running");
      expect(branches[0].pullRequestUrl).toBe("https://github.com/acme/app/pull/42");
      expect(branches[1].identifier).toBe("MT-2");
      expect(branches[1].status).toBe("retrying");
    });
  });

  describe("with GitHub token", () => {
    let server: http.Server;
    let port: number;
    const mockFetch = vi.fn();

    beforeAll(async () => {
      mockFetch.mockImplementation(async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes("/repos/acme/app/pulls")) {
          return {
            ok: true,
            json: async () => [
              {
                number: 42,
                title: "Fix auth bug",
                user: { login: "alice" },
                state: "open",
                updated_at: "2024-01-01T00:00:00Z",
                html_url: "https://github.com/acme/app/pull/42",
                head: { ref: "symphony/mt-1" },
              },
            ],
          };
        }
        if (urlStr.includes("/repos/acme/app/commits")) {
          return {
            ok: true,
            json: async () => [
              {
                sha: "abc1234567890",
                commit: {
                  message: "initial commit\n\ndetails here",
                  author: { name: "Alice", date: "2024-01-01T00:00:00Z" },
                },
              },
            ],
          };
        }
        if (urlStr.includes("/repos/acme/app")) {
          return {
            ok: true,
            json: async () => ({
              description: "The app repo",
              visibility: "private",
              open_issues_count: 5,
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      const app = createApp({
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore([
          {
            repoUrl: "https://github.com/acme/app.git",
            defaultBranch: "main",
            identifierPrefix: "MT",
            githubOwner: "acme",
            githubRepo: "app",
          },
        ]) as never,
        secretsStore: makeSecretsStore("ghp_test123") as never,
        fetchImpl: mockFetch as unknown as typeof fetch,
      });
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          port = (server.address() as { port: number }).port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    it("returns enriched repo data from GitHub API", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/git/context`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.githubAvailable).toBe(true);

      const repos = body.repos as Array<Record<string, unknown>>;
      expect(repos).toHaveLength(1);
      const github = repos[0].github as Record<string, unknown>;
      expect(github).toBeDefined();
      expect(github.description).toBe("The app repo");
      expect(github.visibility).toBe("private");
      expect(github.openPrCount).toBe(1);

      const pulls = github.pulls as Array<Record<string, unknown>>;
      expect(pulls).toHaveLength(1);
      expect(pulls[0].number).toBe(42);
      expect(pulls[0].author).toBe("alice");

      const commits = github.recentCommits as Array<Record<string, unknown>>;
      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe("abc1234");
      expect(commits[0].message).toBe("initial commit");
    });
  });

  describe("with no repos configured", () => {
    let server: http.Server;
    let port: number;

    beforeAll(async () => {
      const app = createApp({
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore([]) as never,
        secretsStore: makeSecretsStore(null) as never,
      });
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          port = (server.address() as { port: number }).port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    it("returns empty repos array", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/git/context`);
      const body = (await res.json()) as Record<string, unknown>;
      const repos = body.repos as unknown[];
      expect(repos).toHaveLength(0);
    });
  });

  describe("with GitHub API failure", () => {
    let server: http.Server;
    let port: number;
    const failingFetch = vi.fn().mockRejectedValue(new Error("network error"));

    beforeAll(async () => {
      const app = createApp({
        orchestrator: makeOrchestrator() as never,
        configStore: makeConfigStore([
          {
            repoUrl: "https://github.com/acme/app.git",
            defaultBranch: "main",
            identifierPrefix: "MT",
            githubOwner: "acme",
            githubRepo: "app",
          },
        ]) as never,
        secretsStore: makeSecretsStore("ghp_test123") as never,
        fetchImpl: failingFetch as unknown as typeof fetch,
      });
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          port = (server.address() as { port: number }).port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    it("gracefully degrades to config-only data", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/git/context`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.githubAvailable).toBe(true);

      const repos = body.repos as Array<Record<string, unknown>>;
      expect(repos).toHaveLength(1);
      expect(repos[0].github).toBeUndefined();
    });
  });
});
