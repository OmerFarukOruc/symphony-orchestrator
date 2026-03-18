import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { Liquid } from "liquidjs";

import { failureOutcome, outcomeForAbort } from "./agent-runner/abort-outcomes.js";
import { handleNotification } from "./agent-runner/notification-handler.js";
import { composeSessionId, createTurnState } from "./agent-runner/turn-state.js";
import { executeTurns } from "./agent-runner/turn-executor.js";
import { createSuccessResponse, type JsonRpcRequest } from "./codex-protocol.js";
import { JsonRpcConnection, JsonRpcTimeoutError } from "./agent/json-rpc-connection.js";
import { prepareCodexRuntimeConfig, getRequiredProviderEnvNames } from "./codex-runtime-config.js";
import { buildDockerRunArgs } from "./docker-spawn.js";
import { removeContainer, stopContainer } from "./docker-lifecycle.js";
import { getContainerStats } from "./docker-stats.js";
import { handleCodexRequest } from "./agent/codex-request-handler.js";
import type { GithubApiToolClient } from "./github-api-tool.js";
import { LinearClient } from "./linear-client.js";
import type { PathRegistry } from "./path-registry.js";
import { authIsRequired, extractRateLimits, extractThreadId, hasUsableAccount } from "./agent-runner-helpers.js";
import type {
  Issue,
  ModelSelection,
  RecentEvent,
  RunOutcome,
  ServiceConfig,
  SymphonyLogger,
  TokenUsageSnapshot,
  Workspace,
} from "./types.js";
import { WorkspaceManager } from "./workspace-manager.js";

export { extractItemContent } from "./agent-runner-helpers.js";

export interface AgentRunnerEventHandler {
  (
    event: RecentEvent & {
      usage?: TokenUsageSnapshot;
      usageMode?: "absolute_total" | "delta";
      rateLimits?: unknown;
      content?: string | null;
    },
  ): void;
}

export class AgentRunner {
  private readonly liquid = new Liquid({ strictFilters: true, strictVariables: true });
  private readonly turnState = createTurnState();

  constructor(
    private readonly deps: {
      getConfig: () => ServiceConfig;
      linearClient: LinearClient;
      workspaceManager: WorkspaceManager;
      archiveDir?: string;
      pathRegistry?: PathRegistry;
      githubToolClient?: GithubApiToolClient;
      logger: SymphonyLogger;
      spawnProcess?: typeof spawn;
    },
  ) {}

  async runAttempt(input: {
    issue: Issue;
    attempt: number | null;
    modelSelection: ModelSelection;
    promptTemplate: string;
    workspace: Workspace;
    signal: AbortSignal;
    onEvent: AgentRunnerEventHandler;
  }): Promise<RunOutcome> {
    const config = this.deps.getConfig();
    const logger = this.deps.logger.child({
      issueIdentifier: input.issue.identifier,
      workspacePath: input.workspace.path,
    });

    await this.deps.workspaceManager.prepareForAttempt(input.workspace);
    await this.deps.workspaceManager.runBeforeRun(input.workspace);

    let threadId: string | null = null;
    const turnId: string | null = null;
    const turnCount = 0;
    let fatalFailure: { code: string; message: string } | null = null;
    let containerName: string | null = null;
    const spawnProcess = this.deps.spawnProcess ?? spawn;
    const runtimeConfig = await prepareCodexRuntimeConfig(config.codex);
    // Pre-create host directories so Docker doesn't auto-create them as root:root
    const archiveDir = this.deps.archiveDir ?? path.join(process.cwd(), "archive");
    await mkdir(archiveDir, { recursive: true });
    const docker = buildDockerRunArgs({
      sandboxConfig: config.codex.sandbox,
      runId: `${input.issue.identifier}-${Date.now()}`,
      command: config.codex.command,
      workspacePath: input.workspace.path,
      archiveDir,
      pathRegistry: this.deps.pathRegistry,
      runtimeConfigToml: runtimeConfig.configToml,
      runtimeAuthJsonBase64: runtimeConfig.authJsonBase64,
      requiredEnv: getRequiredProviderEnvNames(config.codex),
      issueIdentifier: input.issue.identifier,
      model: input.modelSelection.model,
    });
    containerName = docker.containerName;
    const child: ChildProcessWithoutNullStreams = spawnProcess(docker.program, docker.args, {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const connection = new JsonRpcConnection(
      child,
      logger,
      config.codex.readTimeoutMs,
      async (request) => {
        const result = await this.handleIncomingRequest(request);
        if (result.fatalFailure) {
          fatalFailure = result.fatalFailure;
          connection.close();
          return;
        }
        if (result.response !== undefined) {
          child.stdin.write(`${JSON.stringify(createSuccessResponse(request.id, result.response))}\n`);
        }
      },
      (notification) => {
        handleNotification({
          state: this.turnState,
          notification,
          issue: input.issue,
          threadId,
          turnId,
          onEvent: input.onEvent,
        });
      },
    );

    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const abortHandler = () => {
      connection.close();
      if (containerName) {
        void stopContainer(containerName, 5);
      }
    };
    input.signal.addEventListener("abort", abortHandler, { once: true });

    let statsInterval: ReturnType<typeof setInterval> | null = null;
    try {
      // Wait for the child process to become ready before sending JSON-RPC
      await this.waitForStartup(child, config.codex.startupTimeoutMs, input.signal);

      // Start periodic container stats polling (every 30s)
      const statsIntervalMs = 30_000;
      if (containerName) {
        statsInterval = setInterval(async () => {
          try {
            const stats = await getContainerStats(containerName!);
            if (stats) {
              input.onEvent({
                at: new Date().toISOString(),
                issueId: input.issue.id,
                issueIdentifier: input.issue.identifier,
                sessionId: composeSessionId(threadId, turnId),
                event: "container_stats",
                message: `CPU ${stats.cpuPercent} | MEM ${stats.memoryUsage}/${stats.memoryLimit} (${stats.memoryPercent})`,
              });
            }
          } catch {
            // Stats collection is best-effort; don't interrupt the run
          }
        }, statsIntervalMs);
      }
      await connection.request("initialize", {
        clientInfo: { name: "symphony", version: "0.2.0" },
        capabilities: {
          experimentalApi: true,
        },
      });
      connection.notify("initialized", {});

      const accountInfo = await connection.request("account/read", {});
      if (authIsRequired(accountInfo) && !hasUsableAccount(accountInfo)) {
        return {
          kind: "failed",
          errorCode: "startup_failed",
          errorMessage: "codex account/read reported that OpenAI auth is required and no account is configured",
          threadId,
          turnId,
          turnCount,
        };
      }

      try {
        const rateLimitResult = await connection.request("account/rateLimits/read", {});
        input.onEvent({
          at: new Date().toISOString(),
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          sessionId: threadId,
          event: "rate_limits_updated",
          message: "rate limits refreshed",
          rateLimits: extractRateLimits(rateLimitResult),
        });
      } catch (error) {
        logger.warn({ error: String(error) }, "rate limit preflight unavailable");
      }

      const threadResult = await connection.request("thread/start", {
        cwd: input.workspace.path,
        model: input.modelSelection.model,
        approvalPolicy: config.codex.approvalPolicy,
        sandbox: config.codex.threadSandbox,
        personality: "friendly",
        dynamicTools: [
          {
            name: "linear_graphql",
            description: "Run exactly one GraphQL operation against Linear.",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                query: {
                  type: "string",
                  description: "A single GraphQL query, mutation, or subscription document.",
                },
                variables: {
                  type: "object",
                  additionalProperties: true,
                  description: "Optional GraphQL variables for the document.",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "github_api",
            description: "Read pull request status or add a pull request comment in GitHub.",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                action: {
                  type: "string",
                  enum: ["add_pr_comment", "get_pr_status"],
                },
                owner: {
                  type: "string",
                },
                repo: {
                  type: "string",
                },
                pullNumber: {
                  type: "number",
                },
                body: {
                  type: "string",
                },
              },
              required: ["action", "owner", "repo", "pullNumber"],
            },
          },
        ],
      });
      threadId = extractThreadId(threadResult);
      if (!threadId) {
        throw new Error("thread/start did not return a thread identifier");
      }

      let parsedTemplate;
      try {
        parsedTemplate = this.liquid.parse(input.promptTemplate);
      } catch (error) {
        return {
          kind: "failed",
          errorCode: "template_parse_error",
          errorMessage: error instanceof Error ? error.message : String(error),
          threadId,
          turnId,
          turnCount,
        };
      }

      let prompt: string;
      try {
        prompt = await this.liquid.render(parsedTemplate, {
          issue: input.issue,
          attempt: input.attempt,
          workspace: input.workspace,
        });
      } catch (error) {
        return {
          kind: "failed",
          errorCode: "template_render_error",
          errorMessage: error instanceof Error ? error.message : String(error),
          threadId,
          turnId,
          turnCount,
        };
      }

      return await executeTurns(
        {
          connection,
          config,
          prompt,
          runInput: {
            issue: input.issue,
            attempt: input.attempt,
            modelSelection: input.modelSelection,
            workspace: input.workspace,
            signal: input.signal,
            onEvent: input.onEvent,
          },
          turnState: this.turnState,
          linearClient: this.deps.linearClient,
        },
        {
          threadId,
          turnId,
          turnCount,
          containerName,
          exitPromise,
          getFatalFailure: () => fatalFailure,
        },
      );
    } catch (error) {
      {
        const maybeFailureOutcome = failureOutcome(fatalFailure, threadId, turnId, turnCount);
        if (maybeFailureOutcome) {
          return maybeFailureOutcome;
        }
      }
      if (input.signal.aborted) {
        return outcomeForAbort(input.signal, threadId, turnId, turnCount);
      }
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof JsonRpcTimeoutError || message.includes("timed out")) {
        const timeoutCode = message.includes("turn completion") ? "turn_timeout" : "read_timeout";
        return {
          kind: "timed_out",
          errorCode: timeoutCode,
          errorMessage: message,
          threadId,
          turnId,
          turnCount,
        };
      }
      if (message.includes("connection exited")) {
        return {
          kind: "failed",
          errorCode: "port_exit",
          errorMessage: message,
          threadId,
          turnId,
          turnCount,
        };
      }
      if (message.includes("startup readiness")) {
        return {
          kind: "failed",
          errorCode: "startup_timeout",
          errorMessage: message,
          threadId,
          turnId,
          turnCount,
        };
      }
      return {
        kind: "failed",
        errorCode: "startup_failed",
        errorMessage: message,
        threadId,
        turnId,
        turnCount,
      };
    } finally {
      if (statsInterval) {
        clearInterval(statsInterval);
      }
      input.signal.removeEventListener("abort", abortHandler);

      // Graceful drain: give connection time to flush final notifications
      if (!input.signal.aborted && config.codex.drainTimeoutMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.codex.drainTimeoutMs));
      }

      connection.close();
      if (containerName) {
        await stopContainer(containerName, 5);
        await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 5000))]).catch(() => undefined);
        await removeContainer(containerName);
      }
      await this.deps.workspaceManager.runAfterRun(input.workspace).catch((error) => {
        logger.warn({ error: String(error) }, "after_run hook failed");
      });
    }
  }

  private async handleIncomingRequest(
    request: JsonRpcRequest,
  ): Promise<{ response?: unknown; fatalFailure: { code: string; message: string } | null }> {
    return handleCodexRequest(request, this.deps.linearClient, this.deps.githubToolClient);
  }

  /**
   * Wait for the child process to become ready by detecting its first
   * output on stdout or stderr. Races against a startup timeout and
   * the abort signal. Listening on both streams handles backends that
   * may emit to stderr before stdout.
   */
  private waitForStartup(child: ChildProcessWithoutNullStreams, timeoutMs: number, signal: AbortSignal): Promise<void> {
    if (timeoutMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const onData = () => settle(resolve);
      const onExit = (code: number | null) =>
        settle(() => reject(new Error(`child exited with code ${code} before startup readiness`)));
      const onAbort = () => settle(() => reject(new Error("startup readiness interrupted")));
      const timer = setTimeout(
        () => settle(() => reject(new Error(`startup readiness timed out after ${timeoutMs}ms`))),
        timeoutMs,
      );

      const cleanup = () => {
        child.stdout.removeListener("data", onData);
        child.stderr.removeListener("data", onData);
        child.removeListener("exit", onExit);
        signal.removeEventListener("abort", onAbort);
        clearTimeout(timer);
      };

      child.stdout.once("data", onData);
      child.stderr.once("data", onData);
      child.once("exit", onExit);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
