import { classifyRunError, failureOutcome, outcomeForAbort } from "./abort-outcomes.js";
import type { CodexRuntimePort, CodexRuntimeSession } from "./codex-runtime-port.js";
import type { PrecomputedRuntimeConfig } from "./docker-session.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import { createLifecycleEvent } from "../core/lifecycle-events.js";
import type { StopSignal } from "../core/signal-detection.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, RisolutoLogger, Workspace } from "../core/types.js";
import { toErrorString } from "../utils/type-guards.js";
import type { WorkspaceManager } from "../workspace/manager.js";

export interface ActiveAttempt {
  outcome: Promise<RunOutcome>;
  steer(message: string): Promise<boolean>;
  abort(reason?: string): void;
}

export interface AttemptLaunchInput {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  promptTemplate: string;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  precomputedRuntimeConfig?: PrecomputedRuntimeConfig;
  previousThreadId?: string | null;
  previousPrFeedback?: string | null;
}

export interface AttemptExecutor {
  launch(input: AttemptLaunchInput): Promise<ActiveAttempt>;
}

interface AttemptExecutorDeps {
  getConfig: () => ServiceConfig;
  workspaceManager: WorkspaceManager;
  runtimePort: CodexRuntimePort;
  logger: RisolutoLogger;
}

export class DefaultAttemptExecutor implements AttemptExecutor {
  constructor(private readonly deps: AttemptExecutorDeps) {}

  async launch(input: AttemptLaunchInput): Promise<ActiveAttempt> {
    const logger = this.deps.logger.child({
      issueIdentifier: input.issue.identifier,
      workspacePath: input.workspace.path,
    });

    const abortBridge = createAbortSignalBridge(input.signal);
    const { signal } = abortBridge;

    await this.deps.workspaceManager.prepareForAttempt(input.workspace);
    await this.deps.workspaceManager.runBeforeRun(input.workspace, input.issue.identifier);

    let lastAgentMessageContent: string | null = null;
    let lastStopSignal: StopSignal | null = null;
    const contentCapturingOnEvent: AgentRunnerEventHandler = (event) => {
      if (
        ((event.event === "agent_message" && event.message?.includes("completed")) ||
          (event.event === "item_completed" && event.message?.includes("agentMessage"))) &&
        event.content
      ) {
        lastAgentMessageContent = event.content;
      }
      if (event.stopSignal) {
        lastStopSignal = event.stopSignal;
      }
      input.onEvent(event);
    };

    let runtime: CodexRuntimeSession;
    try {
      runtime = await this.deps.runtimePort.start({
        issue: input.issue,
        modelSelection: input.modelSelection,
        workspace: input.workspace,
        signal,
        onEvent: contentCapturingOnEvent,
        precomputedRuntimeConfig: input.precomputedRuntimeConfig,
      });
    } catch (error) {
      contentCapturingOnEvent(
        createLifecycleEvent({
          issue: input.issue,
          event: "container_failed",
          message: "Sandbox container failed to start",
          metadata: {
            error: toErrorString(error),
            workspacePath: input.workspace.path,
          },
        }),
      );
      abortBridge.detach();
      throw error;
    }

    const outcome = this.runActiveAttempt(
      runtime,
      {
        ...input,
        signal,
        onEvent: contentCapturingOnEvent,
      },
      logger,
      () => lastAgentMessageContent,
      () => lastStopSignal,
      abortBridge.detach,
    );

    return {
      outcome,
      steer: (message: string) => runtime.steer(message),
      abort: (reason?: string) => {
        if (!signal.aborted) {
          abortBridge.abort(reason);
        }
      },
    };
  }

  private async runActiveAttempt(
    runtime: CodexRuntimeSession,
    input: Omit<AttemptLaunchInput, "precomputedRuntimeConfig"> & { signal: AbortSignal },
    logger: Pick<RisolutoLogger, "warn">,
    getLastAgentMessageContent: () => string | null,
    getLastStopSignal: () => StopSignal | null,
    cleanupAbortBridge: (reason?: string) => void,
  ): Promise<RunOutcome> {
    try {
      const initResult = await runtime.initialize({
        issue: input.issue,
        attempt: input.attempt,
        modelSelection: input.modelSelection,
        workspace: input.workspace,
        promptTemplate: input.promptTemplate,
        signal: input.signal,
        onEvent: input.onEvent,
        previousThreadId: input.previousThreadId ?? null,
        previousPrFeedback: input.previousPrFeedback ?? null,
      });

      if ("kind" in initResult) {
        const failure = classifyLifecycleFailure(initResult);
        input.onEvent(
          createLifecycleEvent({
            issue: input.issue,
            event: failure.event,
            message: failure.message,
            metadata: {
              errorCode: initResult.errorCode,
              errorMessage: initResult.errorMessage,
              threadId: initResult.threadId,
            },
          }),
        );
        return initResult;
      }

      const outcome = await runtime.execute({
        issue: input.issue,
        attempt: input.attempt,
        modelSelection: input.modelSelection,
        workspace: input.workspace,
        signal: input.signal,
        onEvent: input.onEvent,
        prompt: initResult.prompt,
        getLastAgentMessageContent,
        getLastStopSignal,
      });

      const config = this.deps.getConfig();
      if (config.codex.selfReview && outcome.kind === "normal" && outcome.threadId) {
        const review = await runtime.review(
          outcome.threadId,
          input.signal,
          Math.min(config.codex.turnTimeoutMs, 300_000),
        );
        if (review) {
          input.onEvent(
            createLifecycleEvent({
              issue: input.issue,
              event: "self_review",
              message:
                review.passed === true
                  ? `Self-review passed: ${review.summary}`
                  : review.passed === false
                    ? `Self-review flagged issues: ${review.summary}`
                    : `Self-review completed: ${review.summary}`,
              sessionId: outcome.threadId,
            }),
          );
        }
      }

      return outcome;
    } catch (error) {
      return handleRunError(error, runtime, input.signal);
    } finally {
      cleanupAbortBridge();
      await runtime.shutdown(input.signal);
      await this.deps.workspaceManager.runAfterRun(input.workspace, input.issue.identifier).catch((error) => {
        logger.warn({ error: toErrorString(error) }, "after_run hook failed");
      });
    }
  }
}

function createAbortSignalBridge(source: AbortSignal): {
  signal: AbortSignal;
  abort: (reason?: string) => void;
  detach: () => void;
} {
  const controller = new AbortController();
  const forwardAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(source.reason);
    }
  };

  if (source.aborted) {
    forwardAbort();
  } else {
    source.addEventListener("abort", forwardAbort, { once: true });
  }

  return {
    signal: controller.signal,
    abort(reason?: string) {
      source.removeEventListener("abort", forwardAbort);
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    },
    detach() {
      source.removeEventListener("abort", forwardAbort);
    },
  };
}

function classifyLifecycleFailure(outcome: RunOutcome): { event: string; message: string } {
  const msg = outcome.errorMessage ?? "";
  if (outcome.errorCode === "startup_failed" && msg.includes("auth is required")) {
    return { event: "auth_failed", message: "Codex authentication is required before the agent can start" };
  }
  if (
    outcome.errorCode === "startup_timeout" ||
    outcome.errorCode === "port_exit" ||
    outcome.errorCode === "container_start_failed"
  ) {
    return { event: "container_failed", message: "Sandbox container failed during startup" };
  }
  return { event: "codex_failed", message: "Codex initialization failed" };
}

function handleRunError(error: unknown, runtime: CodexRuntimeSession, signal: AbortSignal): RunOutcome {
  const threadId = runtime.getThreadId();
  const turnId: string | null = null;
  const turnCount = 0;
  const maybeFailureOutcome = failureOutcome(runtime.getFatalFailure(), threadId, turnId, turnCount);
  if (maybeFailureOutcome) {
    return maybeFailureOutcome;
  }
  if (signal.aborted) {
    return outcomeForAbort(signal, threadId, turnId, turnCount);
  }
  return classifyRunError(error, threadId, turnId, turnCount);
}
