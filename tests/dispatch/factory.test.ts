import { afterEach, describe, expect, it, vi } from "vitest";

import { createDispatcher } from "../../src/dispatch/factory.js";
import { AgentRunner } from "../../src/agent-runner/index.js";
import { DispatchClient } from "../../src/dispatch/client.js";
import { createMockLogger } from "../helpers.js";
import type { DispatcherFactoryDeps } from "../../src/dispatch/factory.js";
import type { ServiceConfig } from "../../src/core/types.js";

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "TEST",
      activeStates: ["In Progress"],
      terminalStates: ["Done"],
    },
    polling: { intervalMs: 1000 },
    workspace: {
      root: "/tmp/risoluto",
      strategy: "directory",
      branchPrefix: "risoluto/",
      hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
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
      auth: { mode: "api_key", sourceHome: "/tmp/auth" },
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
    github: { token: "github-token", apiBaseUrl: "https://api.github.com" },
    repos: [],
  } as unknown as ServiceConfig;
}

function createMockDeps(): DispatcherFactoryDeps {
  const logger = createMockLogger();
  return {
    tracker: {
      fetchCandidateIssues: vi.fn(),
      fetchIssueStatesByIds: vi.fn(),
      fetchIssuesByStates: vi.fn(),
      resolveStateId: vi.fn(),
      updateIssueState: vi.fn(),
      createComment: vi.fn(),
      transitionIssue: vi.fn(),
    },
    trackerToolProvider: { toolNames: [], handleToolCall: vi.fn() } as DispatcherFactoryDeps["trackerToolProvider"],
    workspaceManager: {} as DispatcherFactoryDeps["workspaceManager"],
    archiveDir: "/tmp/archives",
    pathRegistry: {} as DispatcherFactoryDeps["pathRegistry"],
    githubToolClient: {} as DispatcherFactoryDeps["githubToolClient"],
    logger,
  };
}

describe("createDispatcher", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates AgentRunner when DISPATCH_MODE is not set (default)", () => {
    delete process.env.DISPATCH_MODE;
    const dispatcher = createDispatcher(() => createConfig(), createMockDeps());

    expect(dispatcher).toBeInstanceOf(AgentRunner);
  });

  it("creates AgentRunner when DISPATCH_MODE is 'local'", () => {
    process.env.DISPATCH_MODE = "local";
    const dispatcher = createDispatcher(() => createConfig(), createMockDeps());

    expect(dispatcher).toBeInstanceOf(AgentRunner);
  });

  it("creates DispatchClient when DISPATCH_MODE is 'remote'", () => {
    process.env.DISPATCH_MODE = "remote";
    const dispatcher = createDispatcher(() => createConfig(), createMockDeps());

    expect(dispatcher).toBeInstanceOf(DispatchClient);
  });

  it("passes DISPATCH_URL to DispatchClient", () => {
    process.env.DISPATCH_MODE = "remote";
    process.env.DISPATCH_URL = "http://custom:9100/dispatch";
    const dispatcher = createDispatcher(() => createConfig(), createMockDeps());

    expect(dispatcher).toBeInstanceOf(DispatchClient);
  });

  it("creates logger children with correct component names", () => {
    delete process.env.DISPATCH_MODE;
    const deps = createMockDeps();
    createDispatcher(() => createConfig(), deps);

    expect(deps.logger.child).toHaveBeenCalledWith({ component: "agent-runner" });
  });

  it("creates dispatch-client logger child in remote mode", () => {
    process.env.DISPATCH_MODE = "remote";
    const deps = createMockDeps();
    createDispatcher(() => createConfig(), deps);

    expect(deps.logger.child).toHaveBeenCalledWith({ component: "dispatch-client" });
  });
});
