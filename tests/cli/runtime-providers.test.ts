import { describe, expect, it, vi } from "vitest";

import { createGitHubToolProvider, createRepoRouterProvider } from "../../src/cli/runtime-providers.js";
import type { RepoMatch } from "../../src/git/repo-router.js";
import type { Issue, ServiceConfig } from "../../src/core/types.js";

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done"],
    },
    polling: { intervalMs: 1000 },
    workspace: {
      root: "/tmp/risoluto",
      strategy: "directory",
      branchPrefix: "risoluto/",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
    },
    agent: {
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: {},
      maxTurns: 2,
      maxRetryBackoffMs: 10000,
      maxContinuationAttempts: 1,
      successState: null,
      stallTimeoutMs: 0,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 1000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 0,
      stallTimeoutMs: 0,
      auth: {
        mode: "api_key",
        sourceHome: "/tmp/auth",
      },
      provider: null,
      sandbox: {
        image: "risoluto-codex:latest",
        network: "",
        security: { noNewPrivileges: true, dropCapabilities: true, gvisor: false, seccompProfile: "" },
        resources: { memory: "4g", memoryReservation: "1g", memorySwap: "4g", cpus: "2.0", tmpfsSize: "512m" },
        extraMounts: [],
        envPassthrough: [],
        logs: { driver: "json-file", maxSize: "50m", maxFile: 3 },
        egressAllowlist: [],
      },
    },
    server: { port: 4000 },
    github: {
      token: "github-token",
      apiBaseUrl: "https://api.github.com",
    },
    repos: [
      {
        repoUrl: "https://github.com/acme/alpha.git",
        defaultBranch: "main",
        identifierPrefix: "API",
        label: null,
      },
    ],
  };
}

function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    identifier: "API-42",
    title: "Refactor runtime providers",
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

describe("runtime providers", () => {
  it("rebuilds repo routes from the latest config on each match", () => {
    const config = createConfig();
    const provider = createRepoRouterProvider(() => config);

    expect(provider.matchIssue(createIssue())).toMatchObject({
      repoUrl: "https://github.com/acme/alpha.git",
    } satisfies Partial<RepoMatch>);

    config.repos = [
      {
        repoUrl: "https://github.com/acme/beta.git",
        defaultBranch: "develop",
        identifierPrefix: null,
        label: "mobile",
      },
    ];

    expect(provider.matchIssue(createIssue({ identifier: "WEB-9", labels: ["mobile"] }))).toMatchObject({
      repoUrl: "https://github.com/acme/beta.git",
      defaultBranch: "develop",
      matchedBy: "label",
    } satisfies Partial<RepoMatch>);
  });

  it("rebuilds GitManager with the latest apiBaseUrl on each call", async () => {
    const config = createConfig();
    const createGitManager = vi.fn((deps: { apiBaseUrl?: string }) => {
      return {
        cloneInto: vi.fn(async () => undefined),
        commitAndPush: vi.fn(async () => undefined),
        createPullRequest: vi.fn(async () => undefined),
        addPrComment: vi.fn(async () => undefined),
        setupWorktree: vi.fn(async () => undefined),
        syncWorktree: vi.fn(async () => undefined),
        removeWorktree: vi.fn(async () => undefined),
        deriveBaseCloneDir: vi.fn(() => "/tmp/risoluto/.base/repo.git"),
        getPrStatus: vi.fn(async () => ({ apiBaseUrl: deps.apiBaseUrl ?? null })),
      };
    });
    const provider = createGitHubToolProvider(() => config, {
      env: {},
      createGitManager: createGitManager as never,
    });

    await expect(
      provider.getPrStatus({
        owner: "acme",
        repo: "repo",
        pullNumber: 1,
      }),
    ).resolves.toEqual({
      apiBaseUrl: "https://api.github.com",
    });

    config.github = {
      token: "github-token",
      apiBaseUrl: "https://github.example.test/api",
    };

    await expect(
      provider.getPrStatus({
        owner: "acme",
        repo: "repo",
        pullNumber: 2,
      }),
    ).resolves.toEqual({
      apiBaseUrl: "https://github.example.test/api",
    });

    expect(createGitManager).toHaveBeenCalledTimes(2);
    expect(createGitManager).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        apiBaseUrl: "https://api.github.com",
      }),
    );
    expect(createGitManager).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        apiBaseUrl: "https://github.example.test/api",
      }),
    );
  });

  it("hydrates missing GitHub token env vars from secrets on each call", async () => {
    const config = createConfig();
    const createGitManager = vi.fn((deps: { env?: NodeJS.ProcessEnv }) => {
      return {
        cloneInto: vi.fn(async () => undefined),
        commitAndPush: vi.fn(async () => undefined),
        createPullRequest: vi.fn(async () => undefined),
        addPrComment: vi.fn(async () => undefined),
        setupWorktree: vi.fn(async () => undefined),
        syncWorktree: vi.fn(async () => undefined),
        removeWorktree: vi.fn(async () => undefined),
        deriveBaseCloneDir: vi.fn(() => "/tmp/risoluto/.base/repo.git"),
        getPrStatus: vi.fn(async () => ({ token: deps.env?.GITHUB_TOKEN ?? null })),
      };
    });

    const provider = createGitHubToolProvider(() => config, {
      env: {},
      resolveSecret: (name) => (name === "GITHUB_TOKEN" ? "ghs_from_secret" : undefined),
      createGitManager: createGitManager as never,
    });

    await expect(
      provider.getPrStatus({
        owner: "acme",
        repo: "repo",
        pullNumber: 1,
      }),
    ).resolves.toEqual({
      token: "ghs_from_secret",
    });
  });
});
