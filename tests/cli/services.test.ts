import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createServices } from "../../src/cli/services.js";
import { FileAttemptStore } from "../../src/core/attempt-store.js";
import { DualWriteAttemptStore } from "../../src/core/dual-write-store.js";
import { FEATURE_FLAG_DUAL_WRITE, resetFlags, setFlag } from "../../src/core/feature-flags.js";
import type { ServiceConfig } from "../../src/core/types.js";
import { createMockLogger } from "../helpers.js";

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["In Progress"],
      terminalStates: ["Done"],
      requiredLabel: null,
    },
    polling: { intervalMs: 1000 },
    workspace: {
      root: "/tmp/symphony",
      strategy: "directory",
      branchPrefix: "symphony/",
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
        image: "symphony-codex:latest",
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
    repos: [],
  };
}

function createConfigStore() {
  const config = createConfig();
  return {
    getConfig: () => config,
    subscribe: () => () => undefined,
  };
}

function createOverlayStore() {
  return {};
}

function createSecretsStore() {
  return {
    get: vi.fn(() => null),
  };
}

describe("createServices", () => {
  const originalDispatchMode = process.env.DISPATCH_MODE;

  beforeEach(() => {
    process.env.DISPATCH_MODE = "remote";
    resetFlags();
  });

  afterEach(() => {
    if (originalDispatchMode === undefined) {
      delete process.env.DISPATCH_MODE;
    } else {
      process.env.DISPATCH_MODE = originalDispatchMode;
    }
    resetFlags();
    vi.restoreAllMocks();
  });

  it("uses the file attempt store when DUAL_WRITE is disabled", async () => {
    const startSpy = vi.spyOn(FileAttemptStore.prototype, "start").mockResolvedValue(undefined);
    const dualStartSpy = vi.spyOn(DualWriteAttemptStore.prototype, "start").mockResolvedValue(undefined);

    await createServices(
      createConfigStore() as never,
      createOverlayStore() as never,
      createSecretsStore() as never,
      "/archive",
      createMockLogger() as never,
    );

    expect(startSpy).toHaveBeenCalledOnce();
    expect(dualStartSpy).not.toHaveBeenCalled();
  });

  it("uses the dual-write attempt store when DUAL_WRITE is enabled", async () => {
    setFlag(FEATURE_FLAG_DUAL_WRITE, true);
    const dualStartSpy = vi.spyOn(DualWriteAttemptStore.prototype, "start").mockResolvedValue(undefined);

    await createServices(
      createConfigStore() as never,
      createOverlayStore() as never,
      createSecretsStore() as never,
      "/archive",
      createMockLogger() as never,
    );

    expect(dualStartSpy).toHaveBeenCalledOnce();
  });
});
