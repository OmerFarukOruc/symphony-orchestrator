import { vi } from "vitest";

import type { Issue, RunOutcome, ServiceConfig, WorkflowDefinition } from "../../src/core/types.js";
import { createLogger } from "../../src/core/logger.js";
import { ConfigStore } from "../../src/config/store.js";
import type { TrackerPort } from "../../src/tracker/port.js";
import { WorkspaceManager } from "../../src/workspace/manager.js";
import { AgentRunner } from "../../src/agent-runner/index.js";
import { AttemptStore } from "../../src/core/attempt-store.js";
import type { IssueConfigStore } from "../../src/persistence/sqlite/issue-config-store.js";

export function createIssue(state = "In Progress"): Issue {
  return {
    id: "issue-1",
    identifier: "MT-42",
    title: "Retry me",
    description: null,
    priority: 1,
    state,
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
  };
}

export function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    polling: { intervalMs: 30000 },
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
      maxTurns: 1,
      maxRetryBackoffMs: 300000,
      maxContinuationAttempts: 5,
      successState: null,
      stallTimeoutMs: 10000,
    },
    codex: {
      command: "codex app-server",
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 1000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 5000,
      stallTimeoutMs: 10000,
      auth: {
        mode: "api_key",
        sourceHome: "/tmp/unused-codex-home",
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
  };
}

export function createConfigStore(config: ServiceConfig): ConfigStore {
  const workflow: WorkflowDefinition = { config: {}, promptTemplate: "Prompt" };
  return {
    getConfig: () => config,
    getWorkflow: () => workflow,
    subscribe: () => () => undefined,
  } as unknown as ConfigStore;
}

export function createResolveTemplate(): (identifier: string) => Promise<string> {
  return async (_identifier: string) => "Prompt";
}

export function createAttemptStore(): AttemptStore {
  return {
    createAttempt: vi.fn(async () => undefined),
    updateAttempt: vi.fn(async () => undefined),
    appendEvent: vi.fn(async () => undefined),
    getAllAttempts: vi.fn(() => []),
    getAttemptsForIssue: vi.fn(() => []),
    getAttempt: vi.fn(() => null),
    getEvents: vi.fn(() => []),
    sumArchivedSeconds: vi.fn(() => 0),
    sumCostUsd: vi.fn(() => 0),
    sumArchivedTokens: vi.fn(() => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })),
  } as unknown as AttemptStore;
}

export function createIssueConfigStore(): IssueConfigStore {
  return {
    loadAll: vi.fn(() => []),
    upsertModel: vi.fn(),
    upsertTemplateId: vi.fn(),
    clearTemplateId: vi.fn(),
  } as unknown as IssueConfigStore;
}

export { createLogger };
export type { AgentRunner, TrackerPort, WorkspaceManager, Issue, RunOutcome, ServiceConfig };
