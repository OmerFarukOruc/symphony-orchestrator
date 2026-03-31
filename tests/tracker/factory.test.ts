import { describe, expect, it, vi } from "vitest";

import { createTracker } from "../../src/tracker/factory.js";
import { LinearClient } from "../../src/linear/client.js";
import { LinearTrackerAdapter } from "../../src/tracker/linear-adapter.js";
import { createMockLogger } from "../helpers.js";
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

describe("createTracker", () => {
  it("returns a TrackerPort and the underlying LinearClient", () => {
    const logger = createMockLogger();
    const result = createTracker(() => createConfig(), logger);

    expect(result.tracker).toBeInstanceOf(LinearTrackerAdapter);
    expect(result.linearClient).toBeInstanceOf(LinearClient);
  });

  it("creates logger child with linear component", () => {
    const logger = createMockLogger();
    createTracker(() => createConfig(), logger);

    expect(logger.child).toHaveBeenCalledWith({ component: "linear" });
  });

  it("tracker delegates fetchCandidateIssues to linearClient", async () => {
    const logger = createMockLogger();
    const result = createTracker(() => createConfig(), logger);
    const mockIssues = [{ id: "1", identifier: "TEST-1", title: "Test", state: "In Progress" }];
    vi.spyOn(result.linearClient, "fetchCandidateIssues").mockResolvedValue(mockIssues as never);

    const issues = await result.tracker.fetchCandidateIssues();

    expect(issues).toEqual(mockIssues);
    expect(result.linearClient.fetchCandidateIssues).toHaveBeenCalledOnce();
  });
});
