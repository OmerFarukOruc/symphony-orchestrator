import type { Liquid } from "liquidjs";

import { asRecord, asString, authIsRequired, extractRateLimits, extractThreadId, hasUsableAccount } from "./helpers.js";
import { fetchAvailableModels } from "./model-validation.js";
import { waitForStartup, StartupTimeoutError, buildDynamicTools } from "./session-helpers.js";
import type { DockerSession } from "./docker-session.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import { createLifecycleEvent } from "../core/lifecycle-events.js";
import { validatePromptTemplate } from "../prompt/template-policy.js";
import { toErrorString } from "../utils/type-guards.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, RisolutoLogger, Workspace } from "../core/types.js";

interface SessionInitDeps {
  logger: RisolutoLogger;
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
  /** Thread ID from a previous attempt — enables thread/resume instead of thread/start. */
  previousThreadId?: string | null;
  /** When true and thread/resume succeeds, issue thread/rollback to undo the last bad turn. */
  rollbackLastTurn?: boolean;
  /**
   * Formatted PR review feedback from the previous attempt's open pull request.
   * When present, this is appended to the rendered prompt under a
   * "### Previous PR Review Feedback" heading.
   */
  previousPrFeedback?: string | null;
}

interface SessionInitSuccess {
  threadId: string;
  prompt: string;
}

type EarlyOutcome = RunOutcome & { threadId: string | null; turnId: string | null; turnCount: number };

function summarizeCodexConfig(result: unknown): Record<string, unknown> {
  const config = asRecord(asRecord(result).config);
  return {
    model: config.model ?? null,
    modelProvider: config.model_provider ?? config.modelProvider ?? null,
    reasoningEffort: config.model_reasoning_effort ?? config.modelReasoningEffort ?? null,
    approvalPolicy: config.approval_policy ?? config.approvalPolicy ?? null,
  };
}

function summarizeRequirements(result: unknown): Record<string, unknown> {
  const requirements = asRecord(asRecord(result).requirements);
  return {
    allowedApprovalPolicies: requirements.allowedApprovalPolicies ?? null,
    allowedSandboxModes: requirements.allowedSandboxModes ?? null,
    network: requirements.network ?? null,
  };
}

function summarizeThread(result: unknown): Record<string, unknown> {
  const thread = asRecord(asRecord(result).thread);
  return {
    threadId: asString(thread.id),
    name: asString(thread.name),
    status: thread.status ?? null,
    ephemeral: thread.ephemeral ?? null,
  };
}

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

  const resolvedThreadId = await startThread(session, config, input, deps);
  session.threadId = resolvedThreadId;

  return renderPromptTemplate(liquid, input, resolvedThreadId, turnId, turnCount);
}

async function initCodexProtocol(
  session: DockerSession,
  input: SessionInitInput,
  deps: SessionInitDeps,
): Promise<{ kind: "failed"; errorCode: string; errorMessage: string } | null> {
  await session.connection.request("initialize", {
    clientInfo: {
      name: "risoluto",
      title: "Risoluto",
      version: process.env.npm_package_version ?? "unknown",
    },
    capabilities: {
      experimentalApi: true,
      optOutNotificationMethods: [
        "thread/archived",
        "thread/unarchived",
        "thread/closed",
        "serverRequest/resolved",
        "app/list/updated",
        "windowsSandbox/setupCompleted",
      ],
    },
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

  try {
    const requirementsResult = await session.connection.request("configRequirements/read", {});
    input.onEvent({
      at: new Date().toISOString(),
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      sessionId: null,
      event: "codex_requirements_loaded",
      message: "codex runtime requirements loaded",
      metadata: summarizeRequirements(requirementsResult),
    });
  } catch {
    // Older Codex versions may not support configRequirements — skip
  }

  try {
    const configResult = await session.connection.request("config/read", { includeLayers: false });
    input.onEvent({
      at: new Date().toISOString(),
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      sessionId: null,
      event: "codex_config_loaded",
      message: "codex runtime config loaded",
      metadata: summarizeCodexConfig(configResult),
    });
  } catch {
    // Older Codex versions may not support config/read — skip
  }

  return null;
}

async function startThread(
  session: DockerSession,
  config: ServiceConfig,
  input: SessionInitInput,
  deps: SessionInitDeps,
): Promise<string> {
  if (input.previousThreadId) {
    try {
      const resumeResult = await session.connection.request("thread/resume", {
        threadId: input.previousThreadId,
      });
      const resumedId = extractThreadId(resumeResult);
      if (resumedId) {
        deps.logger.info({ threadId: resumedId }, "resumed previous thread");
        if (input.rollbackLastTurn) {
          await session.connection.request("thread/rollback", { threadId: resumedId, numTurns: 1 }).catch(() => {
            deps.logger.info({ threadId: resumedId }, "thread/rollback failed — continuing with resumed thread");
          });
        }
        await emitThreadSnapshot(session, input, resumedId);
        return resumedId;
      }
    } catch {
      deps.logger.info({ previousThreadId: input.previousThreadId }, "thread/resume failed — starting fresh thread");
    }
  }

  const threadResult = await session.connection.request("thread/start", {
    cwd: input.workspace.path,
    model: input.modelSelection.model,
    approvalPolicy: config.codex.approvalPolicy,
    sandbox: config.codex.threadSandbox,
    personality: config.codex.personality,
    serviceName: "risoluto",
    dynamicTools: buildDynamicTools(),
  });

  const resolvedThreadId = extractThreadId(threadResult);
  if (!resolvedThreadId) {
    throw new Error("thread/start did not return a thread identifier");
  }
  await emitThreadSnapshot(session, input, resolvedThreadId);
  return resolvedThreadId;
}

async function emitThreadSnapshot(session: DockerSession, input: SessionInitInput, threadId: string): Promise<void> {
  try {
    const threadReadResult = await session.connection.request("thread/read", { threadId, includeTurns: false });
    input.onEvent({
      at: new Date().toISOString(),
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      sessionId: threadId,
      event: "thread_loaded",
      message: "codex thread snapshot loaded",
      metadata: summarizeThread(threadReadResult),
    });
  } catch {
    // Older Codex versions may not support thread/read — skip
  }
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
    validatePromptTemplate(input.promptTemplate);
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

  // Append PR review feedback from the previous attempt when available.
  // The feedback is pre-formatted by `formatPRFeedbackForPrompt` and
  // contains a Markdown heading, so we add a blank line as separator.
  if (input.previousPrFeedback) {
    prompt = `${prompt}\n\n${input.previousPrFeedback}`;
  }

  return { threadId, prompt };
}
