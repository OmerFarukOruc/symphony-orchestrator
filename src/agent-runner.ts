import { spawn } from "node:child_process";
import path from "node:path";

import { Liquid } from "liquidjs";

import { createSuccessResponse, type JsonRpcRequest } from "./codex-protocol.js";
import { JsonRpcConnection, JsonRpcTimeoutError } from "./agent/json-rpc-connection.js";
import { buildDockerRunArgs, resolveAuthSourceHome } from "./docker-spawn.js";
import { inspectOomKilled, removeContainer, stopContainer } from "./docker-lifecycle.js";
import { handleCodexRequest } from "./agent/codex-request-handler.js";
import { LinearClient } from "./linear-client.js";
import {
  asRecord,
  asString,
  authIsRequired,
  extractItemContent,
  extractRateLimits,
  extractThreadId,
  extractTokenUsageSnapshot,
  extractTurnId,
  getTurnSandboxPolicy,
  hasUsableAccount,
} from "./agent-runner-helpers.js";
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
import { sanitizeContent } from "./content-sanitizer.js";

const CONTINUATION_PROMPT = "Continue the current issue, make concrete progress, and stop only when done or blocked.";

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
  private readonly reasoningBuffers = new Map<string, string>();

  constructor(
    private readonly deps: {
      getConfig: () => ServiceConfig;
      linearClient: LinearClient;
      workspaceManager: WorkspaceManager;
      logger: SymphonyLogger;
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
    let turnId: string | null = null;
    let turnCount = 0;
    let fatalFailure: { code: string; message: string } | null = null;
    // eslint-disable-next-line no-useless-assignment -- reassigned conditionally in sandbox branch
    let exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | null = null;
    let containerName: string | null = null;
    // eslint-disable-next-line no-useless-assignment -- reassigned in OOM branch
    let oomKilled = false;

    const sandboxEnabled = config.codex.sandbox.enabled;
    let child;
    if (sandboxEnabled) {
      const docker = buildDockerRunArgs({
        sandboxConfig: config.codex.sandbox,
        runId: `${input.issue.identifier}-${Date.now()}`,
        command: config.codex.command,
        workspacePath: input.workspace.path,
        codexHome: process.env.CODEX_HOME ?? path.join(resolveAuthSourceHome(), "..", ".symphony-codex-home"),
        archiveDir: process.env.SYMPHONY_ARCHIVE_DIR ?? path.join(process.cwd(), "archive"),
      });
      containerName = docker.containerName;
      child = spawn(docker.program, docker.args, {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else {
      child = spawn("bash", ["-lc", config.codex.command], {
        cwd: input.workspace.path,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

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
        this.handleNotification({
          notification,
          issue: input.issue,
          threadId,
          onEvent: input.onEvent,
        });
      },
    );

    exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const abortHandler = () => {
      connection.close();
      if (sandboxEnabled && containerName) {
        void stopContainer(containerName, 5);
      }
    };
    input.signal.addEventListener("abort", abortHandler, { once: true });

    try {
      await connection.request("initialize", {
        clientInfo: { name: "symphony", version: "0.1.1" },
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
        ],
      });
      threadId = extractThreadId(threadResult);
      if (!threadId) {
        throw new Error("thread/start did not return a thread identifier");
      }

      const prompt = await this.liquid.parseAndRender(input.promptTemplate, {
        issue: input.issue,
        attempt: input.attempt,
        workspace: input.workspace,
      });

      while (turnCount < config.agent.maxTurns) {
        if (input.signal.aborted) {
          return this.outcomeForAbort(input.signal, threadId, turnId, turnCount);
        }

        turnCount += 1;
        const turnResult = await connection.request("turn/start", {
          threadId,
          cwd: input.workspace.path,
          model: input.modelSelection.model,
          effort: input.modelSelection.reasoningEffort,
          approvalPolicy: config.codex.approvalPolicy,
          sandboxPolicy: getTurnSandboxPolicy(config, input.workspace.path),
          input: [
            {
              type: "text",
              text: turnCount === 1 ? prompt : CONTINUATION_PROMPT,
            },
          ],
        });
        turnId = extractTurnId(turnResult);
        if (!turnId) {
          throw new Error("turn/start did not return a turn identifier");
        }

        const completedTurn = await this.waitForTurnCompletion({
          turnId,
          signal: input.signal,
          timeoutMs: config.codex.turnTimeoutMs,
        });

        const completedTurnRecord = asRecord(asRecord(completedTurn).turn);
        const completedStatus = asString(completedTurnRecord.status) ?? "failed";
        const completedError = asRecord(completedTurnRecord.error);
        const completedUsage =
          extractTokenUsageSnapshot(asRecord(turnResult).usage) ??
          extractTokenUsageSnapshot(asRecord(turnResult).tokenUsage);

        input.onEvent({
          at: new Date().toISOString(),
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          sessionId: threadId,
          event: "turn_completed",
          message:
            sanitizeContent(
              completedStatus === "completed"
                ? `turn ${turnCount} completed`
                : completedError.message
                  ? String(completedError.message)
                  : `turn ${turnCount} ended with status ${completedStatus}`,
            ) || `turn ${turnCount} ended with status ${completedStatus}`,
          usage: completedUsage ?? undefined,
          rateLimits: extractRateLimits(turnResult) ?? undefined,
        });

        {
          const maybeFailureOutcome = this.failureOutcome(fatalFailure, threadId, turnId, turnCount);
          if (maybeFailureOutcome) {
            return maybeFailureOutcome;
          }
        }

        if (completedStatus === "failed") {
          return {
            kind: "failed",
            errorCode: "turn_failed",
            errorMessage: asString(completedError.message) ?? "turn failed",
            threadId,
            turnId,
            turnCount,
          };
        }
        if (completedStatus === "interrupted") {
          return {
            kind: "cancelled",
            errorCode: "interrupted",
            errorMessage: asString(completedError.message) ?? "turn interrupted",
            threadId,
            turnId,
            turnCount,
          };
        }

        const latestIssue = (await this.deps.linearClient.fetchIssueStatesByIds([input.issue.id]))[0];
        if (!latestIssue || !this.isActiveState(latestIssue.state)) {
          break;
        }
      }

      const exitState = await Promise.race([
        exitPromise,
        new Promise<{ code: null; signal: null }>((resolve) =>
          setTimeout(() => resolve({ code: null, signal: null }), 20),
        ),
      ]);
      {
        const maybeFailureOutcome = this.failureOutcome(fatalFailure, threadId, turnId, turnCount);
        if (maybeFailureOutcome) {
          return maybeFailureOutcome;
        }
      }
      if (exitState.code !== null && !input.signal.aborted) {
        // For Docker: exit code 137 may indicate OOM kill
        if (sandboxEnabled && containerName && exitState.code === 137) {
          oomKilled = await inspectOomKilled(containerName);
          if (oomKilled) {
            return {
              kind: "failed",
              errorCode: "container_oom",
              errorMessage: `container OOM-killed (memory limit: ${config.codex.sandbox.resources.memory})`,
              threadId,
              turnId,
              turnCount,
            };
          }
        }
        return {
          kind: "failed",
          errorCode: "port_exit",
          errorMessage: `codex subprocess exited with code ${exitState.code}`,
          threadId,
          turnId,
          turnCount,
        };
      }

      return {
        kind: "normal",
        errorCode: null,
        errorMessage: null,
        threadId,
        turnId,
        turnCount,
      };
    } catch (error) {
      {
        const maybeFailureOutcome = this.failureOutcome(fatalFailure, threadId, turnId, turnCount);
        if (maybeFailureOutcome) {
          return maybeFailureOutcome;
        }
      }
      if (input.signal.aborted) {
        return this.outcomeForAbort(input.signal, threadId, turnId, turnCount);
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
      return {
        kind: "failed",
        errorCode: "startup_failed",
        errorMessage: message,
        threadId,
        turnId,
        turnCount,
      };
    } finally {
      input.signal.removeEventListener("abort", abortHandler);
      connection.close();
      if (sandboxEnabled && containerName) {
        // For Docker: stop container if still running, then remove
        await stopContainer(containerName, 5);
        await Promise.race([
          exitPromise ?? Promise.resolve({ code: null, signal: null }),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]).catch(() => undefined);
        await removeContainer(containerName);
      } else {
        if (!child.killed) {
          child.kill("SIGTERM");
        }
        await Promise.race([
          exitPromise ?? Promise.resolve({ code: null, signal: null }),
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]).catch(() => undefined);
      }
      await this.deps.workspaceManager.runAfterRun(input.workspace).catch((error) => {
        logger.warn({ error: String(error) }, "after_run hook failed");
      });
    }
  }

  private async handleIncomingRequest(
    request: JsonRpcRequest,
  ): Promise<{ response?: unknown; fatalFailure: { code: string; message: string } | null }> {
    return handleCodexRequest(request, this.deps.linearClient);
  }

  private outcomeForAbort(
    signal: AbortSignal,
    threadId: string | null,
    turnId: string | null,
    turnCount: number,
  ): RunOutcome {
    if (signal.reason === "stalled") {
      return {
        kind: "stalled",
        errorCode: "stalled",
        errorMessage: "worker exceeded stall timeout",
        threadId,
        turnId,
        turnCount,
      };
    }
    if (signal.reason === "terminal") {
      return {
        kind: "cancelled",
        errorCode: "terminal",
        errorMessage: "worker stopped because the issue reached a terminal state",
        threadId,
        turnId,
        turnCount,
      };
    }
    if (signal.reason === "inactive") {
      return {
        kind: "cancelled",
        errorCode: "inactive",
        errorMessage: "worker stopped because the issue is no longer in an active state",
        threadId,
        turnId,
        turnCount,
      };
    }
    if (signal.reason === "shutdown") {
      return {
        kind: "cancelled",
        errorCode: "shutdown",
        errorMessage: "worker cancelled during service shutdown",
        threadId,
        turnId,
        turnCount,
      };
    }
    if (signal.reason === "model_override_updated") {
      return {
        kind: "cancelled",
        errorCode: "model_override_updated",
        errorMessage: "worker cancelled to apply updated model settings",
        threadId,
        turnId,
        turnCount,
      };
    }
    return {
      kind: "cancelled",
      errorCode: "cancelled",
      errorMessage: "worker cancelled",
      threadId,
      turnId,
      turnCount,
    };
  }

  private isActiveState(state: string): boolean {
    const normalized = state.trim().toLowerCase();
    if (["done", "completed", "canceled", "cancelled", "duplicate"].includes(normalized)) {
      return false;
    }
    return !["backlog", "triage", "todo", "planned"].includes(normalized);
  }

  private waitForTurnCompletion(input: { turnId: string; signal: AbortSignal; timeoutMs: number }): Promise<unknown> {
    const alreadyCompleted = this.completedTurnNotifications.get(input.turnId);
    if (alreadyCompleted !== undefined) {
      this.completedTurnNotifications.delete(input.turnId);
      return Promise.resolve(alreadyCompleted);
    }

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.turnCompletionResolvers.delete(input.turnId);
        clearTimeout(timer);
        reject(new Error("turn completion interrupted"));
      };
      const timer = setTimeout(() => {
        this.turnCompletionResolvers.delete(input.turnId);
        input.signal.removeEventListener("abort", onAbort);
        reject(new Error(`timed out waiting for turn completion after ${input.timeoutMs}ms`));
      }, input.timeoutMs);

      this.turnCompletionResolvers.set(input.turnId, (payload) => {
        clearTimeout(timer);
        input.signal.removeEventListener("abort", onAbort);
        resolve(payload);
      });
      input.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private handleNotification(input: {
    notification: { method: string; params?: unknown };
    issue: Issue;
    threadId: string | null;
    onEvent: AgentRunnerEventHandler;
  }): void {
    const params = asRecord(input.notification.params);
    if (input.notification.method === "turn/started") {
      const turn = asRecord(params.turn);
      const startedTurnId = asString(turn.id);
      input.onEvent({
        at: new Date().toISOString(),
        issueId: input.issue.id,
        issueIdentifier: input.issue.identifier,
        sessionId: input.threadId,
        event: "turn_started",
        message: startedTurnId ? `turn ${startedTurnId} started` : "turn started",
      });
      return;
    }

    if (input.notification.method === "turn/completed") {
      const turn = asRecord(params.turn);
      const turnId = asString(turn.id);
      if (turnId) {
        const resolver = this.turnCompletionResolvers.get(turnId);
        if (resolver) {
          resolver(params);
          this.turnCompletionResolvers.delete(turnId);
        } else {
          this.completedTurnNotifications.set(turnId, params);
        }
      }
      return;
    }

    if (input.notification.method === "thread/tokenUsage/updated") {
      const turnId = asString(params.turnId);
      const tokenUsage = asRecord(params.tokenUsage);
      const total = extractTokenUsageSnapshot(tokenUsage.total);
      if (!total) {
        return;
      }
      input.onEvent({
        at: new Date().toISOString(),
        issueId: input.issue.id,
        issueIdentifier: input.issue.identifier,
        sessionId: input.threadId,
        event: "token_usage_updated",
        message: turnId ? `token usage updated for ${turnId}` : "token usage updated",
        usage: total,
        usageMode: "absolute_total",
      });
      return;
    }

    if (
      input.notification.method === "item/reasoning/summaryTextDelta" ||
      input.notification.method === "item/reasoning/textDelta"
    ) {
      const delta = asRecord(params.delta);
      const itemId = asString(delta.id) ?? asString(params.itemId);
      const text = asString(delta.text);
      if (itemId && text) {
        const current = this.reasoningBuffers.get(itemId) ?? "";
        this.reasoningBuffers.set(itemId, current + text);
      }
      return;
    }

    if (input.notification.method === "item/reasoning/summaryPartAdded") {
      const part = asRecord(params.part);
      const itemId = asString(params.itemId);
      const text = asString(part.text);
      if (itemId && text) {
        const current = this.reasoningBuffers.get(itemId) ?? "";
        this.reasoningBuffers.set(itemId, current + text);
      }
      return;
    }

    if (input.notification.method === "item/started" || input.notification.method === "item/completed") {
      const item = asRecord(params.item);
      const itemType = asString(item.type) ?? "item";
      const itemId = asString(item.id);
      const verb = input.notification.method.endsWith("started") ? "started" : "completed";

      const content = extractItemContent(itemType, itemId, item, verb, this.reasoningBuffers);
      if (verb === "completed" && itemId) {
        this.reasoningBuffers.delete(itemId);
      }

      input.onEvent({
        at: new Date().toISOString(),
        issueId: input.issue.id,
        issueIdentifier: input.issue.identifier,
        sessionId: input.threadId,
        event: input.notification.method.replace("/", "_"),
        message: sanitizeContent(itemId ? `${itemType} ${itemId} ${verb}` : `${itemType} ${verb}`) || "item event",
        content,
      });
      return;
    }

    const level = asString(input.notification.method) ?? "unknown_method";
    input.onEvent({
      at: new Date().toISOString(),
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      sessionId: input.threadId,
      event: "other_message",
      message: sanitizeContent(level) || "other",
    });
  }

  private readonly turnCompletionResolvers = new Map<string, (payload: unknown) => void>();
  private readonly completedTurnNotifications = new Map<string, unknown>();

  private failureOutcome(
    failure: { code: string; message: string } | null,
    threadId: string | null,
    turnId: string | null,
    turnCount: number,
  ): RunOutcome | null {
    if (!failure) {
      return null;
    }
    return {
      kind: "failed",
      errorCode: failure.code,
      errorMessage: failure.message,
      threadId,
      turnId,
      turnCount,
    };
  }
}
