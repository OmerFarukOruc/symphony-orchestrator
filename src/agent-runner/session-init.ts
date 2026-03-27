import type { Liquid } from "liquidjs";

import { authIsRequired, extractRateLimits, extractThreadId, hasUsableAccount } from "./helpers.js";
import { fetchAvailableModels } from "./model-validation.js";
import { waitForStartup, StartupTimeoutError, buildDynamicTools } from "./session-helpers.js";
import type { DockerSession } from "./docker-session.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import { createLifecycleEvent } from "../core/lifecycle-events.js";
import { toErrorString } from "../utils/type-guards.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, SymphonyLogger, Workspace } from "../core/types.js";

interface SessionInitDeps {
  logger: SymphonyLogger;
}

interface SessionInitInput {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  workspace: Workspace;
  promptTemplate: string;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  startupTimeoutMs: number;
}

interface SessionInitSuccess {
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

  try {
    await waitForStartup(session.child, input.startupTimeoutMs, input.signal);
  } catch (error) {
    if (error instanceof StartupTimeoutError) {
      const isRunning = await session.inspectRunning().catch(() => null);
      input.onEvent(
        createLifecycleEvent({
          issue: input.issue,
          event: "container_startup_timeout",
          message: `Container startup readiness timed out after ${input.startupTimeoutMs}ms`,
          metadata: {
            containerName: session.containerName,
            containerRunning: isRunning,
            stderrOutput: error.stderrOutput || null,
          },
        }),
      );
    }
    throw error;
  }

  const containerFailure = await confirmContainerRunning(session, input);
  if (containerFailure) {
    return { ...containerFailure, threadId, turnId, turnCount };
  }

  input.onEvent(
    createLifecycleEvent({
      issue: input.issue,
      event: "codex_initializing",
      message: "Initializing Codex session",
      metadata: {
        containerName: session.containerName,
      },
    }),
  );

  const earlyFailure = await initCodexProtocol(session, input, deps);
  if (earlyFailure) {
    return { ...earlyFailure, threadId, turnId, turnCount };
  }

  const availableModels = await fetchAvailableModels(session.connection, deps.logger);
  if (availableModels && !availableModels.includes(input.modelSelection.model)) {
    deps.logger.warn(
      { configured: input.modelSelection.model, available: availableModels },
      "configured model not found in model/list — proceeding anyway",
    );
  }

  const resolvedThreadId = await startThread(session, config, input);
  session.threadId = resolvedThreadId;

  return renderPromptTemplate(liquid, input, resolvedThreadId, turnId, turnCount);
}

async function initCodexProtocol(
  session: DockerSession,
  input: SessionInitInput,
  deps: SessionInitDeps,
): Promise<{ kind: "failed"; errorCode: string; errorMessage: string } | null> {
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
    };
  }

  try {
    const rateLimitResult = await session.connection.request("account/rateLimits/read", {});
    input.onEvent({
      at: new Date().toISOString(),
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      sessionId: null,
      event: "rate_limits_updated",
      message: "rate limits refreshed",
      rateLimits: extractRateLimits(rateLimitResult),
    });
  } catch (error) {
    deps.logger.warn({ error: toErrorString(error) }, "rate limit preflight unavailable");
  }

  return null;
}

async function startThread(session: DockerSession, config: ServiceConfig, input: SessionInitInput): Promise<string> {
  const threadResult = await session.connection.request("thread/start", {
    cwd: input.workspace.path,
    model: input.modelSelection.model,
    approvalPolicy: config.codex.approvalPolicy,
    sandbox: config.codex.threadSandbox,
    personality: "friendly",
    dynamicTools: buildDynamicTools(),
  });

  const resolvedThreadId = extractThreadId(threadResult);
  if (!resolvedThreadId) {
    throw new Error("thread/start did not return a thread identifier");
  }
  return resolvedThreadId;
}

async function confirmContainerRunning(
  session: DockerSession,
  input: SessionInitInput,
): Promise<{ kind: "failed"; errorCode: string; errorMessage: string } | null> {
  try {
    const isRunning = await session.inspectRunning();
    if (isRunning) {
      input.onEvent(
        createLifecycleEvent({
          issue: input.issue,
          event: "container_running",
          message: "Sandbox container running",
          metadata: {
            containerName: session.containerName,
          },
        }),
      );
      return null;
    }

    return {
      kind: "failed",
      errorCode: "container_start_failed",
      errorMessage: "sandbox container failed to reach a running state",
    };
  } catch (error) {
    return {
      kind: "failed",
      errorCode: "container_start_failed",
      errorMessage: toErrorString(error),
    };
  }
}

async function renderPromptTemplate(
  liquid: Liquid,
  input: SessionInitInput,
  threadId: string,
  turnId: string | null,
  turnCount: number,
): Promise<SessionInitSuccess | EarlyOutcome> {
  let parsedTemplate;
  try {
    parsedTemplate = liquid.parse(input.promptTemplate);
  } catch (error) {
    return {
      kind: "failed",
      errorCode: "template_parse_error",
      errorMessage: toErrorString(error),
      threadId,
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
      errorMessage: toErrorString(error),
      threadId,
      turnId,
      turnCount,
    };
  }

  return { threadId, prompt };
}
