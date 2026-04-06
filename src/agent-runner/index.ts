import { classifyRunError, failureOutcome, outcomeForAbort } from "./abort-outcomes.js";
import { type DockerSessionDeps, type PrecomputedRuntimeConfig } from "./docker-session.js";
import { AgentSession } from "./agent-session.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { RunAttemptDispatcher } from "../dispatch/types.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import type { TrackerToolProvider } from "../tracker/tool-provider.js";
import type { TrackerPort } from "../tracker/port.js";
import { createLifecycleEvent } from "../core/lifecycle-events.js";
import { toErrorString } from "../utils/type-guards.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, RisolutoLogger, Workspace } from "../core/types.js";
import { WorkspaceManager } from "../workspace/manager.js";
import { createMetricsCollector, type MetricsCollector } from "../observability/metrics.js";

export { extractItemContent } from "./helpers.js";

export type { AgentRunnerEventHandler } from "./contracts.js";

export class AgentRunner implements RunAttemptDispatcher {
  constructor(
    private readonly deps: {
      getConfig: () => ServiceConfig;
      tracker: TrackerPort;
      trackerToolProvider: TrackerToolProvider;
      workspaceManager: WorkspaceManager;
      archiveDir?: string;
      pathRegistry?: PathRegistry;
      githubToolClient?: GithubApiToolClient;
      logger: RisolutoLogger;
      spawnProcess?: DockerSessionDeps["spawnProcess"];
      metrics?: MetricsCollector;
    },
  ) {
    this.deps.metrics ??= createMetricsCollector();
  }

  async runAttempt(input: {
    issue: Issue;
    attempt: number | null;
    modelSelection: ModelSelection;
    promptTemplate: string;
    workspace: Workspace;
    signal: AbortSignal;
    onEvent: AgentRunnerEventHandler;
    /** Called once the session is ready with a function to steer the active turn. */
    onSteerReady?: (steerTurn: (message: string) => Promise<boolean>) => void;
    /** Pre-computed runtime config for data plane (skips auth.json read) */
    precomputedRuntimeConfig?: PrecomputedRuntimeConfig;
    /** Thread ID from a previous attempt — enables thread/resume on retry. */
    previousThreadId?: string | null;
    /**
     * Formatted PR review feedback from a previous attempt's open pull request.
     * When set, this string is appended to the rendered prompt so the agent
     * can address reviewer comments in the retry run.
     */
    previousPrFeedback?: string | null;
  }): Promise<RunOutcome> {
    const config = this.deps.getConfig();
    const logger = this.deps.logger.child({
      issueIdentifier: input.issue.identifier,
      workspacePath: input.workspace.path,
    });

    await this.deps.workspaceManager.prepareForAttempt(input.workspace);
    await this.deps.workspaceManager.runBeforeRun(input.workspace, input.issue.identifier);

    // Track the latest agent message content and stop signal for early detection.
    // The stopSignal field is extracted from raw (pre-truncation) content by the
    // notification handler, so it is reliable even for very long messages.
    let lastAgentMessageContent: string | null = null;
    let lastStopSignal: import("../core/signal-detection.js").StopSignal | null = null;
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
    const inputWithContentCapture = { ...input, onEvent: contentCapturingOnEvent };

    const session = new AgentSession(config, {
      archiveDir: this.deps.archiveDir,
      pathRegistry: this.deps.pathRegistry,
      githubToolClient: this.deps.githubToolClient,
      trackerToolProvider: this.deps.trackerToolProvider,
      tracker: this.deps.tracker,
      logger: this.deps.logger,
      spawnProcess: this.deps.spawnProcess,
      metrics: this.deps.metrics,
    });

    try {
      await session.start({
        issue: inputWithContentCapture.issue,
        modelSelection: inputWithContentCapture.modelSelection,
        workspace: inputWithContentCapture.workspace,
        signal: inputWithContentCapture.signal,
        onEvent: inputWithContentCapture.onEvent,
        precomputedRuntimeConfig: input.precomputedRuntimeConfig,
      });
    } catch (error) {
      inputWithContentCapture.onEvent(
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
      throw error;
    }

    const steerTurn = session.steerTurn;
    if (steerTurn) {
      input.onSteerReady?.(steerTurn);
    }

    try {
      return await this.executeSession(
        session,
        inputWithContentCapture,
        () => lastAgentMessageContent,
        () => lastStopSignal,
      );
    } catch (error) {
      return handleRunError(error, session, input.signal);
    } finally {
      await session.cleanup(input.signal);
      await this.deps.workspaceManager.runAfterRun(input.workspace, input.issue.identifier).catch((error) => {
        logger.warn({ error: toErrorString(error) }, "after_run hook failed");
      });
    }
  }

  private async executeSession(
    session: AgentSession,
    input: {
      issue: Issue;
      attempt: number | null;
      modelSelection: ModelSelection;
      promptTemplate: string;
      workspace: Workspace;
      signal: AbortSignal;
      onEvent: AgentRunnerEventHandler;
      previousThreadId?: string | null;
      previousPrFeedback?: string | null;
    },
    getLastAgentMessageContent: () => string | null,
    getLastStopSignal?: () => import("../core/signal-detection.js").StopSignal | null,
  ): Promise<RunOutcome> {
    const initResult = await session.initialize({
      ...input,
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

    const { prompt } = initResult;
    const outcome = await session.executeTurns({
      ...input,
      prompt,
      getLastAgentMessageContent,
      getLastStopSignal,
    });

    const config = this.deps.getConfig();
    if (config.codex.selfReview && outcome.kind === "normal" && outcome.threadId) {
      const review = await session.selfReview(
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
  }
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

function handleRunError(
  error: unknown,
  session: { threadId: string | null; getFatalFailure: () => { code: string; message: string } | null },
  signal: AbortSignal,
): RunOutcome {
  const threadId = session.threadId;
  const turnId: string | null = null;
  const turnCount = 0;
  const maybeFailureOutcome = failureOutcome(session.getFatalFailure(), threadId, turnId, turnCount);
  if (maybeFailureOutcome) {
    return maybeFailureOutcome;
  }
  if (signal.aborted) {
    return outcomeForAbort(signal, threadId, turnId, turnCount);
  }
  return classifyRunError(error, threadId, turnId, turnCount);
}
