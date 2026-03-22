import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentRunner, extractItemContent } from "../../src/agent-runner/index.js";
import { createLogger } from "../../src/core/logger.js";
import type { Issue, ServiceConfig } from "../../src/core/types.js";
import { WorkspaceManager } from "../../src/workspace/manager.js";
import { LinearClient } from "../../src/linear/client.js";

const tempDirs: string[] = [];
const fixturePath = path.resolve("tests/fixtures/mock-codex-server.mjs");

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-runner-test-"));
  tempDirs.push(dir);
  return dir;
}

function shellQuote(value: string): string {
  const escaped = value.replace(/'/g, "'\\''");
  return "'" + escaped + "'";
}

function baseIssue(): Issue {
  return {
    id: "issue-1",
    identifier: "MT-42",
    title: "Ship Symphony",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-16T00:00:00Z",
  };
}

async function createRunner(
  tempDir: string,
  scenario: string,
  linearClientOverrides?: Partial<LinearClient>,
): Promise<{
  runner: AgentRunner;
  workspaceManager: WorkspaceManager;
  config: ServiceConfig;
  logPath: string;
}> {
  const logPath = path.join(tempDir, "mock-log.json");
  const config: ServiceConfig = {
    tracker: {
      kind: "linear",
      apiKey: "linear-token",
      endpoint: "https://api.linear.app/graphql",
      projectSlug: "EXAMPLE",
      activeStates: ["In Progress"],
      terminalStates: ["Done", "Completed", "Canceled", "Cancelled", "Duplicate"],
    },
    polling: { intervalMs: 30000 },
    workspace: {
      root: path.join(tempDir, "workspaces"),
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
      maxRetryBackoffMs: 300000,
    },
    codex: {
      command: `MOCK_CODEX_SCENARIO=${shellQuote(scenario)} MOCK_CODEX_LOG_PATH=${shellQuote(logPath)} ${shellQuote(process.execPath)} ${shellQuote(fixturePath)}`,
      model: "gpt-5.4",
      reasoningEffort: "high",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: { type: "dangerFullAccess" },
      readTimeoutMs: 3000,
      turnTimeoutMs: 10000,
      drainTimeoutMs: 0,
      startupTimeoutMs: 0,
      stallTimeoutMs: 10000,
      auth: {
        mode: "api_key",
        sourceHome: path.join(tempDir, "unused-auth-home"),
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
  };

  const workspaceManager = new WorkspaceManager(() => config, createLogger());
  const linearClient = {
    fetchIssueStatesByIds: vi.fn(async () => [{ ...baseIssue(), state: "Done" }]),
    runGraphQL: vi.fn(async () => ({ data: { viewer: { id: "user-1" } } })),
  } as unknown as LinearClient;
  Object.assign(linearClient, linearClientOverrides ?? {});

  return {
    runner: new AgentRunner({
      getConfig: () => config,
      linearClient,
      workspaceManager,
      logger: createLogger(),
      spawnProcess: (_program, _args, options) =>
        spawn("bash", ["-lc", config.codex.command], {
          ...options,
          cwd: options?.cwd ?? undefined,
        }),
    }),
    workspaceManager,
    config,
    logPath,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("AgentRunner", () => {
  it("preserves exact extraction outputs for the phase-one helper seam", () => {
    const reasoningBuffers = new Map<string, string>([["reason-1", "I need to run a query."]]);

    expect(
      extractItemContent(
        "agentMessage",
        "msg-1",
        {
          text: "Here is the result.",
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe("Here is the result.");

    expect(
      extractItemContent(
        "agentMessage",
        "msg-2",
        {
          content: [{ text: "Here is " }, { text: "the result." }, { ignored: true }],
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe("Here is the result.");

    expect(
      extractItemContent(
        "reasoning",
        "reason-1",
        {
          summary: "fallback summary",
          text: "fallback text",
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe("I need to run a query.");

    expect(
      extractItemContent(
        "reasoning",
        "reason-2",
        {
          summary: "fallback summary",
          text: "fallback text",
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe("fallback summary");

    expect(
      extractItemContent(
        "commandExecution",
        "cmd-1",
        {
          command: "printf hello",
        },
        "started",
        reasoningBuffers,
      ),
    ).toBe("printf hello");

    expect(
      extractItemContent(
        "commandExecution",
        "cmd-1",
        {
          output: "Authorization: Bearer secret-token-123",
          exitCode: 7,
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe("Authorization: [REDACTED]");

    expect(
      extractItemContent(
        "commandExecution",
        "cmd-2",
        {
          exitCode: 7,
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe("Exit code: 7");

    expect(
      extractItemContent(
        "fileChange",
        "file-1",
        {
          path: "src/example.ts",
        },
        "started",
        reasoningBuffers,
      ),
    ).toBe("src/example.ts");

    expect(
      extractItemContent(
        "fileChange",
        "file-1",
        {
          diff: `${"a".repeat(500)}z`,
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe(`${"a".repeat(500)}\n…[diff truncated, 1 more chars]`);

    expect(
      extractItemContent(
        "dynamicToolCall",
        "tool-1",
        {
          name: "linear_graphql",
          arguments: {
            query: "query One { viewer { id } }",
            apiKey: "secret-value",
          },
        },
        "started",
        reasoningBuffers,
      ),
    ).toBe(`linear_graphql(${JSON.stringify({ query: "query One { viewer { id } }", apiKey: "[REDACTED]" })})`);

    expect(
      extractItemContent(
        "dynamicToolCall",
        "tool-1",
        {
          result: {
            nested: {
              token: "secret-value",
            },
            ok: true,
          },
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe(JSON.stringify({ nested: { token: "[REDACTED]" }, ok: true }, null, 2));

    expect(
      extractItemContent(
        "webSearch",
        "search-1",
        {
          query: "sympathy for the operator",
        },
        "started",
        reasoningBuffers,
      ),
    ).toBe("sympathy for the operator");

    expect(
      extractItemContent(
        "webSearch",
        "search-1",
        {
          results: [{ title: "One" }, { title: "Two" }, { title: "Three" }],
        },
        "completed",
        reasoningBuffers,
      ),
    ).toBe("Found 3 results");

    expect(
      extractItemContent(
        "userMessage",
        "user-1",
        {
          text: "Please continue.",
        },
        "started",
        reasoningBuffers,
      ),
    ).toBe("Please continue.");

    expect(
      extractItemContent(
        "userMessage",
        "user-2",
        {
          content: [{ text: "Please " }, { text: "continue." }, { ignored: true }],
        },
        "started",
        reasoningBuffers,
      ),
    ).toBe("Please continue.");
  });

  it("completes the protocol handshake, approvals, and dynamic tools", async () => {
    const tempDir = await createTempDir();
    const { runner, workspaceManager, logPath } = await createRunner(tempDir, "success");
    const workspace = await workspaceManager.ensureWorkspace("MT-42");

    const emittedEvents: Array<Record<string, unknown>> = [];
    const outcome = await runner.runAttempt({
      issue: baseIssue(),
      attempt: null,
      modelSelection: {
        model: "gpt-5.4",
        reasoningEffort: "high",
        source: "default",
      },
      promptTemplate: "You are working on {{ issue.identifier }}.",
      workspace,
      signal: new AbortController().signal,
      onEvent: (event) => emittedEvents.push(event as unknown as Record<string, unknown>),
    });

    expect(outcome.kind).toBe("normal");
    expect(outcome.turnCount).toBe(1);

    expect(emittedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "item_started",
          message: "reasoning reason-1 started",
          content: null,
          sessionId: "thread-1-turn-1",
        }),
        expect.objectContaining({
          event: "item_completed",
          message: "reasoning reason-1 completed",
          content: "I need to run a query.",
          sessionId: "thread-1-turn-1",
        }),
        expect.objectContaining({
          event: "item_started",
          message: "agentMessage msg-1 started",
          content: null,
          sessionId: "thread-1-turn-1",
        }),
        expect.objectContaining({
          event: "item_completed",
          message: "agentMessage msg-1 completed",
          content: "Here is the result.",
          sessionId: "thread-1-turn-1",
        }),
        expect.objectContaining({
          event: "turn_completed",
          usage: {
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
          },
        }),
      ]),
    );

    const events = JSON.parse(await readFile(logPath, "utf8")) as Array<Record<string, unknown>>;
    expect(events.filter((event) => event.type === "client_request").map((event) => event.method)).toEqual(
      expect.arrayContaining(["initialize", "account/read", "account/rateLimits/read", "thread/start", "turn/start"]),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "client_request",
          method: "thread/start",
          params: expect.objectContaining({
            model: "gpt-5.4",
            dynamicTools: expect.arrayContaining([
              expect.objectContaining({ name: "linear_graphql" }),
              expect.objectContaining({ name: "github_api" }),
            ]),
          }),
        }),
        expect.objectContaining({
          type: "client_request",
          method: "turn/start",
          params: expect.objectContaining({
            title: "MT-42: Ship Symphony",
            model: "gpt-5.4",
            effort: "high",
          }),
        }),
      ]),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "client_notification",
          method: "initialized",
        }),
        expect.objectContaining({
          type: "server_request_result",
          method: "item/tool/call",
          result: expect.objectContaining({
            success: true,
          }),
        }),
        expect.objectContaining({
          type: "server_request_result",
          method: "item/tool/call",
          result: expect.objectContaining({
            success: false,
          }),
        }),
      ]),
    );
  });

  it("fails early when account/read reports missing auth", async () => {
    const tempDir = await createTempDir();
    const { runner, workspaceManager } = await createRunner(tempDir, "auth_required");
    const workspace = await workspaceManager.ensureWorkspace("MT-42");

    const outcome = await runner.runAttempt({
      issue: baseIssue(),
      attempt: null,
      modelSelection: {
        model: "gpt-5.4",
        reasoningEffort: "high",
        source: "default",
      },
      promptTemplate: "Prompt",
      workspace,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(outcome).toEqual({
      kind: "failed",
      errorCode: "startup_failed",
      errorMessage: "codex account/read reported that OpenAI auth is required and no account is configured",
      threadId: null,
      turnId: null,
      turnCount: 0,
    });
  });

  it("fails hard on interactive user input requests", async () => {
    const tempDir = await createTempDir();
    const { runner, workspaceManager } = await createRunner(tempDir, "user_input");
    const workspace = await workspaceManager.ensureWorkspace("MT-42");

    const outcome = await runner.runAttempt({
      issue: baseIssue(),
      attempt: null,
      modelSelection: {
        model: "gpt-5.4",
        reasoningEffort: "high",
        source: "default",
      },
      promptTemplate: "Prompt",
      workspace,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(outcome).toEqual({
      kind: "failed",
      errorCode: "turn_input_required",
      errorMessage: "codex requested interactive user input, which Symphony does not support",
      threadId: "thread-1",
      turnId: null,
      turnCount: 1,
    });
  });

  it("classifies template parse failures explicitly", async () => {
    const tempDir = await createTempDir();
    const { runner, workspaceManager } = await createRunner(tempDir, "success");
    const workspace = await workspaceManager.ensureWorkspace("MT-42");

    const outcome = await runner.runAttempt({
      issue: baseIssue(),
      attempt: null,
      modelSelection: {
        model: "gpt-5.4",
        reasoningEffort: "high",
        source: "default",
      },
      promptTemplate: "{% if issue.identifier %}",
      workspace,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(outcome.kind).toBe("failed");
    expect(outcome.errorCode).toBe("template_parse_error");
  });

  it("classifies template render failures explicitly", async () => {
    const tempDir = await createTempDir();
    const { runner, workspaceManager } = await createRunner(tempDir, "success");
    const workspace = await workspaceManager.ensureWorkspace("MT-42");

    const outcome = await runner.runAttempt({
      issue: baseIssue(),
      attempt: null,
      modelSelection: {
        model: "gpt-5.4",
        reasoningEffort: "high",
        source: "default",
      },
      promptTemplate: "{{ issue.missing.value }}",
      workspace,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(outcome.kind).toBe("failed");
    expect(outcome.errorCode).toBe("template_render_error");
  });

  it("surfaces required MCP startup failures", async () => {
    const tempDir = await createTempDir();
    const { runner, workspaceManager } = await createRunner(tempDir, "mcp_required_failure");
    const workspace = await workspaceManager.ensureWorkspace("MT-42");

    const outcome = await runner.runAttempt({
      issue: baseIssue(),
      attempt: null,
      modelSelection: {
        model: "gpt-5.4",
        reasoningEffort: "high",
        source: "default",
      },
      promptTemplate: "Prompt",
      workspace,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(outcome).toEqual({
      kind: "failed",
      errorCode: "startup_failed",
      errorMessage: "thread/start failed because a required MCP server did not initialize",
      threadId: null,
      turnId: null,
      turnCount: 0,
    });
  });

  it("classifies unexpected subprocess exits as port_exit", async () => {
    const tempDir = await createTempDir();
    const { runner, workspaceManager } = await createRunner(tempDir, "port_exit");
    const workspace = await workspaceManager.ensureWorkspace("MT-42");

    const outcome = await runner.runAttempt({
      issue: baseIssue(),
      attempt: null,
      modelSelection: {
        model: "gpt-5.4",
        reasoningEffort: "high",
        source: "default",
      },
      promptTemplate: "Prompt",
      workspace,
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(outcome).toMatchObject({
      kind: "failed",
      errorCode: "port_exit",
      threadId: null,
      turnId: null,
      turnCount: 0,
    });
    expect(outcome.errorMessage).toContain("connection exited while waiting for request");
  });
});
