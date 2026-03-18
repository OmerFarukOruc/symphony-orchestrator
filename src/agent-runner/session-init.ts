import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { Liquid } from "liquidjs";

import { authIsRequired, extractRateLimits, extractThreadId, hasUsableAccount } from "../agent-runner-helpers.js";
import type { DockerSession } from "./docker-session.js";
import type { AgentRunnerEventHandler } from "../agent-runner.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, SymphonyLogger, Workspace } from "../types.js";

export interface SessionInitDeps {
  logger: SymphonyLogger;
}

export interface SessionInitInput {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  workspace: Workspace;
  promptTemplate: string;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  startupTimeoutMs: number;
}

export interface SessionInitSuccess {
  threadId: string;
  prompt: string;
}

type EarlyOutcome = RunOutcome & { threadId: string | null; turnId: string | null; turnCount: number };

export async function initializeSession(
  session: DockerSession,
  config: ServiceConfig,
  input: SessionInitInput,
  deps: SessionInitDeps,
  liquid: Liquid,
): Promise<SessionInitSuccess | EarlyOutcome> {
  const threadId: string | null = null;
  const turnId: string | null = null;
  const turnCount = 0;

  await waitForStartup(session.child, input.startupTimeoutMs, input.signal);

  await session.connection.request("initialize", {
    clientInfo: { name: "symphony", version: "0.2.0" },
    capabilities: { experimentalApi: true },
  });
  session.connection.notify("initialized", {});

  const accountInfo = await session.connection.request("account/read", {});
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
    const rateLimitResult = await session.connection.request("account/rateLimits/read", {});
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
    deps.logger.warn({ error: String(error) }, "rate limit preflight unavailable");
  }

  const threadResult = await session.connection.request("thread/start", {
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
            owner: { type: "string" },
            repo: { type: "string" },
            pullNumber: { type: "number" },
            body: { type: "string" },
          },
          required: ["action", "owner", "repo", "pullNumber"],
        },
      },
    ],
  });

  const resolvedThreadId = extractThreadId(threadResult);
  if (!resolvedThreadId) {
    throw new Error("thread/start did not return a thread identifier");
  }
  session.threadId = resolvedThreadId;

  let parsedTemplate;
  try {
    parsedTemplate = liquid.parse(input.promptTemplate);
  } catch (error) {
    return {
      kind: "failed",
      errorCode: "template_parse_error",
      errorMessage: error instanceof Error ? error.message : String(error),
      threadId: resolvedThreadId,
      turnId,
      turnCount,
    };
  }

  let prompt: string;
  try {
    prompt = await liquid.render(parsedTemplate, {
      issue: input.issue,
      attempt: input.attempt,
      workspace: input.workspace,
    });
  } catch (error) {
    return {
      kind: "failed",
      errorCode: "template_render_error",
      errorMessage: error instanceof Error ? error.message : String(error),
      threadId: resolvedThreadId,
      turnId,
      turnCount,
    };
  }

  return { threadId: resolvedThreadId, prompt };
}

function waitForStartup(child: ChildProcessWithoutNullStreams, timeoutMs: number, signal: AbortSignal): Promise<void> {
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
