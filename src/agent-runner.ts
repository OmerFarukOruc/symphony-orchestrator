import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { Liquid } from "liquidjs";

import {
  createErrorResponse,
  createRequest,
  createSuccessResponse,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcSuccessResponse,
  type JsonRpcId,
  type JsonRpcRequest,
} from "./codex-protocol.js";
import { LinearClient } from "./linear-client.js";
import { handleLinearGraphqlToolCall } from "./linear-graphql-tool.js";
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

const MAX_LINE_BYTES = 10 * 1024 * 1024;
const CONTINUATION_PROMPT =
  "Continue the current issue, make concrete progress, and stop only when done or blocked.";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function extractThreadId(result: unknown): string | null {
  const record = asRecord(result);
  return asString(record.threadId) ?? asString(asRecord(record.thread).id) ?? null;
}

function extractTurnId(result: unknown): string | null {
  const record = asRecord(result);
  return asString(record.turnId) ?? asString(asRecord(record.turn).id) ?? null;
}

function extractUsage(result: unknown): { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined {
  const usage = asRecord(asRecord(result).usage ?? asRecord(result).tokenUsage);
  const inputTokens = typeof usage.inputTokens === "number" ? usage.inputTokens : undefined;
  const outputTokens = typeof usage.outputTokens === "number" ? usage.outputTokens : undefined;
  const totalTokens = typeof usage.totalTokens === "number" ? usage.totalTokens : undefined;

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return { inputTokens, outputTokens, totalTokens };
}

function extractTokenUsageSnapshot(value: unknown): TokenUsageSnapshot | null {
  const usage = asRecord(value);
  const inputTokens = typeof usage.inputTokens === "number" ? usage.inputTokens : null;
  const outputTokens = typeof usage.outputTokens === "number" ? usage.outputTokens : null;
  const totalTokens = typeof usage.totalTokens === "number" ? usage.totalTokens : null;
  if (inputTokens === null || outputTokens === null || totalTokens === null) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function getTurnSandboxPolicy(config: ServiceConfig, workspacePath: string): Record<string, unknown> {
  const policy = { ...config.codex.turnSandboxPolicy };
  if (policy.type === "workspaceWrite") {
    const writableRoots = Array.isArray(policy.writableRoots) ? [...policy.writableRoots] : [];
    if (!writableRoots.includes(workspacePath)) {
      writableRoots.push(workspacePath);
    }

    return {
      readOnlyAccess: {
        type: "fullAccess",
      },
      networkAccess: false,
      ...policy,
      writableRoots,
    };
  }

  return policy;
}

function extractRateLimits(result: unknown): unknown | null {
  const record = asRecord(result);
  return record.rateLimits ?? record.limits ?? null;
}

function authIsRequired(result: unknown): boolean {
  const record = asRecord(result);
  const auth = asRecord(record.auth);
  const openai = asRecord(record.openai);
  return (
    record.authRequired === true ||
    record.requiresOpenaiAuth === true ||
    record.requiresLogin === true ||
    auth.required === true ||
    openai.required === true ||
    record.status === "unauthenticated"
  );
}

function hasUsableAccount(result: unknown): boolean {
  const record = asRecord(result);
  return (
    (typeof record.account === "object" && record.account !== null) ||
    typeof record.accountId === "string" ||
    typeof asRecord(record.auth).accountId === "string" ||
    record.status === "authenticated"
  );
}

export function extractItemContent(
  type: string,
  id: string | null,
  item: Record<string, unknown>,
  verb: "started" | "completed",
  reasoningBuffers: Map<string, string>,
): string | null {
  let content: string | null = null;
  let isDiff = false;

  if (type === "agentMessage" && verb === "completed") {
    content = asString(item.text) ?? null;
    if (!content && Array.isArray(item.content)) {
      content = item.content
        .map((c) => asString(asRecord(c).text))
        .filter(Boolean)
        .join("");
    }
  } else if (type === "reasoning" && verb === "completed") {
    if (id && reasoningBuffers.has(id)) {
      content = reasoningBuffers.get(id) ?? null;
    } else {
      content = asString(item.summary) ?? asString(item.text) ?? null;
    }
  } else if (type === "commandExecution") {
    if (verb === "started") {
      content = asString(item.command);
    } else {
      content = asString(item.output) ?? (item.exitCode !== undefined ? `Exit code: ${item.exitCode}` : null);
    }
  } else if (type === "fileChange") {
    if (verb === "started") {
      content = asString(item.path);
    } else {
      content = asString(item.diff) ?? asString(item.content) ?? asString(item.path);
      isDiff = true;
    }
  } else if (type === "dynamicToolCall") {
    if (verb === "started") {
      const name = asString(item.name) ?? "tool";
      const args = typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {});
      content = `${name}(${args})`;
    } else {
      content = asString(item.output) ?? (typeof item.result === "string" ? item.result : JSON.stringify(item.result ?? {}));
    }
  } else if (type === "webSearch") {
    if (verb === "started") {
      content = asString(item.query);
    } else {
      const results = Array.isArray(item.results) ? item.results : [];
      content = `Found ${results.length} results`;
    }
  } else if (type === "userMessage" && verb === "started") {
    content = asString(item.text) ?? null;
    if (!content && Array.isArray(item.content)) {
      content = item.content
        .map((c) => asString(asRecord(c).text))
        .filter(Boolean)
        .join("");
    }
  }

  return sanitizeContent(content, { isDiff });
}

class JsonRpcTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonRpcTimeoutError";
  }
}

class JsonRpcConnection {
  private buffer = "";
  private readonly pending = new Map<
    JsonRpcId,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private exited = false;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly logger: SymphonyLogger,
    private readonly timeoutMs: number,
    private readonly onRequest: (request: JsonRpcRequest) => Promise<void>,
    private readonly onNotification?: (message: { method: string; params?: unknown }) => void,
  ) {
    child.stdout.on("data", (chunk: Buffer) => {
      this.onChunk(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.logger.warn({ stderr: chunk.toString().trim() || null }, "codex stderr");
    });
    child.on("exit", () => {
      this.exited = true;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`connection exited while waiting for request ${id}`));
      }
      this.pending.clear();
    });
  }

  close(): void {
    if (!this.exited) {
      this.child.kill("SIGTERM");
    }
  }

  notify(method: string, params: unknown): void {
    this.send({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const request = createRequest(method, params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new JsonRpcTimeoutError(`timed out waiting for ${method}`));
      }, this.timeoutMs);

      this.pending.set(request.id, { resolve, reject, timer });
      this.send(request);
    });
  }

  private send(message: unknown): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onChunk(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    if (Buffer.byteLength(this.buffer, "utf8") > MAX_LINE_BYTES) {
      this.logger.error({ maxLineBytes: MAX_LINE_BYTES }, "codex line exceeded maximum size");
      this.close();
      return;
    }

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.onLine(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      this.logger.error({ line, error: String(error) }, "invalid json from codex");
      return;
    }

    if (isJsonRpcSuccessResponse(parsed)) {
      const pending = this.pending.get(parsed.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(parsed.id);
        pending.resolve(parsed.result);
      }
      return;
    }

    if (isJsonRpcErrorResponse(parsed)) {
      const pending = this.pending.get(parsed.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(parsed.id);
        pending.reject(new Error(parsed.error.message));
      }
      return;
    }

    if (isJsonRpcRequest(parsed)) {
      void this.onRequest(parsed).catch((error) => {
        this.logger.error({ method: parsed.method, error: String(error) }, "failed to handle codex request");
        this.send(createErrorResponse(parsed.id, error instanceof Error ? error.message : String(error)));
      });
      return;
    }

    if (isJsonRpcNotification(parsed)) {
      this.logger.debug({ method: parsed.method, params: parsed.params ?? null }, "codex notification");
      this.onNotification?.(parsed);
    }
  }
}

export interface AgentRunnerEventHandler {
  (event: RecentEvent & {
    usage?: TokenUsageSnapshot;
    usageMode?: "absolute_total" | "delta";
    rateLimits?: unknown;
    content?: string | null;
  }): void;
}

export class AgentRunner {
  private readonly liquid = new Liquid({ strictFilters: true, strictVariables: true });
  private readonly reasoningBuffers = new Map<string, string>();

  constructor(private readonly deps: {
    getConfig: () => ServiceConfig;
    linearClient: LinearClient;
    workspaceManager: WorkspaceManager;
    logger: SymphonyLogger;
  }) {}

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
    let exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | null = null;

    const child = spawn("bash", ["-lc", config.codex.command], {
      cwd: input.workspace.path,
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
    const abortHandler = () => connection.close();
    input.signal.addEventListener("abort", abortHandler, { once: true });

    try {
        await connection.request("initialize", {
          clientInfo: { name: "symphony", version: "0.1.0" },
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
          message: sanitizeContent(
            completedStatus === "completed"
              ? `turn ${turnCount} completed`
              : completedError.message
                ? String(completedError.message)
                : `turn ${turnCount} ended with status ${completedStatus}`
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
        new Promise<{ code: null; signal: null }>((resolve) => setTimeout(() => resolve({ code: null, signal: null }), 20)),
      ]);
      {
        const maybeFailureOutcome = this.failureOutcome(fatalFailure, threadId, turnId, turnCount);
        if (maybeFailureOutcome) {
          return maybeFailureOutcome;
        }
      }
      if (exitState.code !== null && !input.signal.aborted) {
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
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      await Promise.race([
        exitPromise ?? Promise.resolve({ code: null, signal: null }),
        new Promise((resolve) => setTimeout(resolve, 250)),
      ]).catch(() => undefined);
      await this.deps.workspaceManager.runAfterRun(input.workspace).catch((error) => {
        logger.warn({ error: String(error) }, "after_run hook failed");
      });
    }
  }

  private async handleIncomingRequest(
    request: JsonRpcRequest,
  ): Promise<{ response?: unknown; fatalFailure: { code: string; message: string } | null }> {
    switch (request.method) {
      case "item/commandExecution/requestApproval":
      case "item/fileChange/requestApproval":
        return {
          response: {
            decision: "acceptForSession",
          },
          fatalFailure: null,
        };
      case "item/permissions/requestApproval": {
        const params = asRecord(request.params);
        return {
          response: {
            permissions: params.permissionProfile ?? params.permissions ?? null,
            scope: "session",
          },
          fatalFailure: null,
        };
      }
      case "item/tool/call": {
        const params = asRecord(request.params);
        const toolName = asString(params.name) ?? asString(params.toolName);
        if (toolName === "linear_graphql") {
          const response = await handleLinearGraphqlToolCall(
            this.deps.linearClient,
            params.arguments ?? params.args ?? params.input ?? null,
          );
          return { response, fatalFailure: null };
        }
        return {
          response: {
            success: false,
            contentItems: [
              {
                type: "inputText",
                text: JSON.stringify({
                  error: `unsupported dynamic tool: ${toolName ?? "unknown"}`,
                }),
              },
            ],
          },
          fatalFailure: null,
        };
      }
      case "item/tool/requestUserInput":
        return {
          fatalFailure: {
            code: "turn_input_required",
            message: "codex requested interactive user input, which Symphony does not support",
          },
        };
      case "mcpServer/elicitation/request":
        return {
          fatalFailure: {
            code: "startup_failed",
            message: "thread/start failed because a required MCP server did not initialize",
          },
        };
      case "account/chatgptAuthTokens/refresh":
      case "applyPatchApproval":
      case "execCommandApproval":
        return {
          fatalFailure: {
            code: "startup_failed",
            message: `unsupported interactive request from codex: ${request.method}`,
          },
        };
      default:
        return {
          fatalFailure: {
            code: "startup_failed",
            message: `unsupported codex request method: ${request.method}`,
          },
        };
    }
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

  private waitForTurnCompletion(input: {
    turnId: string;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<unknown> {
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
