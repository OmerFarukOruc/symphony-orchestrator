import { describe, expect, it } from "vitest";

import { isBlockedByNonTerminal, sortIssuesForDispatch } from "../../src/orchestrator/dispatch.js";
import type { Issue, ServiceConfig } from "../../src/core/types.js";

function createConfig(): ServiceConfig {
  return {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done", "Canceled"],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: "/tmp/risoluto",
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 1000,
      },
    },
    agent: {
      maxConcurrentAgents: 2,
      maxConcurrentAgentsByState: {},
      maxTurns: 2,
      maxRetryBackoffMs: 300000,
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

function createIssue(input: Partial<Issue> & Pick<Issue, "id" | "identifier">): Issue {
  return {
    id: input.id,
    identifier: input.identifier,
    title: input.title ?? input.identifier,
    description: input.description ?? null,
    priority: input.priority ?? null,
    state: input.state ?? "Todo",
    branchName: input.branchName ?? null,
    url: input.url ?? null,
    labels: input.labels ?? [],
    blockedBy: input.blockedBy ?? [],
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

describe("dispatch helpers", () => {
  it("sorts by priority ascending and keeps null priorities last", () => {
    const issues = [
      createIssue({ id: "3", identifier: "MT-3", priority: null }),
      createIssue({ id: "2", identifier: "MT-2", priority: 2 }),
      createIssue({ id: "1", identifier: "MT-1", priority: 1 }),
    ];

    const sorted = sortIssuesForDispatch(issues);
    expect(sorted.map((issue) => issue.identifier)).toEqual(["MT-1", "MT-2", "MT-3"]);
  });

  it("sorts equal-priority issues by oldest createdAt first", () => {
    const issues = [
      createIssue({ id: "2", identifier: "MT-2", priority: 1, createdAt: "2026-03-16T00:00:00Z" }),
      createIssue({ id: "1", identifier: "MT-1", priority: 1, createdAt: "2026-03-14T00:00:00Z" }),
    ];

    const sorted = sortIssuesForDispatch(issues);
    expect(sorted.map((issue) => issue.identifier)).toEqual(["MT-1", "MT-2"]);
  });

  it("uses identifier as a deterministic tiebreaker", () => {
    const issues = [
      createIssue({ id: "2", identifier: "MT-12", priority: 1, createdAt: "2026-03-16T00:00:00Z" }),
      createIssue({ id: "1", identifier: "MT-01", priority: 1, createdAt: "2026-03-16T00:00:00Z" }),
    ];

    const sorted = sortIssuesForDispatch(issues);
    expect(sorted.map((issue) => issue.identifier)).toEqual(["MT-01", "MT-12"]);
  });

  it("does not mutate the original input array", () => {
    const issues = [
      createIssue({ id: "2", identifier: "MT-2", priority: 2 }),
      createIssue({ id: "1", identifier: "MT-1", priority: 1 }),
    ];

    const before = issues.map((issue) => issue.identifier);
    sortIssuesForDispatch(issues);

    expect(issues.map((issue) => issue.identifier)).toEqual(before);
  });

  it("detects blockers that are still non-terminal", () => {
    const config = createConfig();
    const issue = createIssue({
      id: "1",
      identifier: "MT-1",
      blockedBy: [{ id: "blk", identifier: "MT-0", state: "In Progress" }],
    });

    expect(isBlockedByNonTerminal(issue, config)).toBe(true);
  });

  it("treats blockers with unknown state as blocking", () => {
    const config = createConfig();
    const issue = createIssue({
      id: "1",
      identifier: "MT-1",
      blockedBy: [{ id: "blk", identifier: "MT-0", state: null }],
    });

    expect(isBlockedByNonTerminal(issue, config)).toBe(true);
  });

  it("returns false when every blocker is terminal", () => {
    const config = createConfig();
    const issue = createIssue({
      id: "1",
      identifier: "MT-1",
      blockedBy: [
        { id: "blk-1", identifier: "MT-0", state: "Done" },
        { id: "blk-2", identifier: "MT-3", state: "Canceled" },
      ],
    });

    expect(isBlockedByNonTerminal(issue, config)).toBe(false);
  });

  it("breaks ties by createdAt when priorities match", () => {
    const issues = [
      createIssue({ id: "2", identifier: "MT-2", priority: 1, createdAt: "2026-03-16T00:00:00Z" }),
      createIssue({ id: "3", identifier: "MT-3", priority: 1, createdAt: null }),
      createIssue({ id: "1", identifier: "MT-1", priority: 1, createdAt: "2026-03-14T00:00:00Z" }),
    ];

    const sorted = sortIssuesForDispatch(issues);
    // MT-1 has earliest date, MT-2 next, MT-3 has null (treated as MAX_SAFE_INTEGER)
    expect(sorted.map((issue) => issue.identifier)).toEqual(["MT-1", "MT-2", "MT-3"]);
  });

  it("handles invalid createdAt by treating as MAX_SAFE_INTEGER", () => {
    const issues = [
      createIssue({ id: "2", identifier: "MT-2", priority: 1, createdAt: "not-a-date" }),
      createIssue({ id: "1", identifier: "MT-1", priority: 1, createdAt: "2026-03-14T00:00:00Z" }),
    ];

    const sorted = sortIssuesForDispatch(issues);
    expect(sorted.map((issue) => issue.identifier)).toEqual(["MT-1", "MT-2"]);
  });
});
