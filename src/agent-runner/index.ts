import { Liquid } from "liquidjs";

import { classifyRunError, failureOutcome, outcomeForAbort } from "./abort-outcomes.js";
import { createTurnState } from "./turn-state.js";
import { executeTurns } from "./turn-executor.js";
import { createDockerSession, type DockerSessionDeps, type PrecomputedRuntimeConfig } from "./docker-session.js";
import { initializeSession } from "./session-init.js";
import { runSelfReview } from "./self-review.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { RunAttemptDispatcher } from "../dispatch/types.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import type { LinearClient } from "../linear/client.js";
import type { TrackerPort } from "../tracker/port.js";
import { createLifecycleEvent } from "../core/lifecycle-events.js";
import { toErrorString } from "../utils/type-guards.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, SymphonyLogger, Workspace } from "../core/types.js";
import { WorkspaceManager } from "../workspace/manager.js";

export { extractItemContent } from "./helpers.js";

export type { AgentRunnerEventHandler } from "./contracts.js";

export class AgentRunner implements RunAttemptDispatcher {
  private readonly liquid = new Liquid({ strictFilters: true, strictVariables: true });
  private readonly turnState = createTurnState();

  constructor(
    private readonly deps: {
      getConfig: () => ServiceConfig;
      tracker: TrackerPort;
      linearClient: LinearClient | null;
      workspaceManager: WorkspaceManager;
      archiveDir?: string;
      pathRegistry?: PathRegistry;
      githubToolClient?: GithubApiToolClient;
      logger: SymphonyLogger;
      spawnProcess?: DockerSessionDeps["spawnProcess"];
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
    /** Called once the session is ready with a function to steer the active turn. */
    onSteerReady?: (steerTurn: (message: string) => Promise<boolean>) => void;
    /** Pre-computed runtime config for data plane (skips auth.json read) */
    precomputedRuntimeConfig?: PrecomputedRuntimeConfig;
    /** Thread ID from a previous attempt — enables thread/resume on retry. */
    previousThreadId?: string | null;
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

    let session: Awaited<ReturnType<typeof createDockerSession>>;
    try {
      session = await createDockerSession(
        config,
        {
          issue: inputWithContentCapture.issue,
          modelSelection: inputWithContentCapture.modelSelection,
          workspace: inputWithContentCapture.workspace,
          signal: inputWithContentCapture.signal,
          onEvent: inputWithContentCapture.onEvent,
        },
        {
          archiveDir: this.deps.archiveDir,
          pathRegistry: this.deps.pathRegistry,
          githubToolClient: this.deps.githubToolClient,
          linearClient: this.deps.linearClient,
          logger: this.deps.logger,
          spawnProcess: this.deps.spawnProcess,
        },
        this.turnState,
        input.precomputedRuntimeConfig,
      );
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

    input.onSteerReady?.(session.steerTurn);

    try {
      return await this.executeSession(
        session,
        config,
        inputWithContentCapture,
        () => lastAgentMessageContent,
        () => lastStopSignal,
      );
    } catch (error) {
      return handleRunError(error, session, input.signal);
    } finally {
      session.turnId = null;
      await session.cleanup(config, input.signal);
      await this.deps.workspaceManager.runAfterRun(input.workspace, input.issue.identifier).catch((error) => {
        logger.warn({ error: toErrorString(error) }, "after_run hook failed");
      });
    }
  }

  private async executeSession(
    session: Awaited<ReturnType<typeof createDockerSession>>,
    config: ServiceConfig,
    input: {
      issue: Issue;
      attempt: number | null;
      modelSelection: ModelSelection;
      promptTemplate: string;
      workspace: Workspace;
      signal: AbortSignal;
      onEvent: AgentRunnerEventHandler;
      previousThreadId?: string | null;
    },
    getLastAgentMessageContent: () => string | null,
    getLastStopSignal?: () => import("../core/signal-detection.js").StopSignal | null,
  ): Promise<RunOutcome> {
    const initResult = await initializeSession(
      session,
      config,
      {
        ...input,
        startupTimeoutMs: config.codex.startupTimeoutMs,
        rollbackLastTurn: Boolean(input.previousThreadId),
      },
      { logger: this.deps.logger },
      this.liquid,
    );

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

    const { threadId, prompt } = initResult;
    const outcome = await executeTurns(
      {
        connection: session.connection,
        config,
        prompt,
        runInput: input,
        turnState: this.turnState,
        tracker: this.deps.tracker,
        setActiveTurnId: (turnId) => {
          session.turnId = turnId;
        },
        getLastAgentMessageContent,
        getLastStopSignal,
        logger: this.deps.logger,
      },
      {
        threadId,
        turnId: null,
        turnCount: 0,
        containerName: session.containerName,
        exitPromise: session.exitPromise,
        getFatalFailure: session.getFatalFailure,
      },
    );

    if (config.codex.selfReview && outcome.kind === "normal" && outcome.threadId) {
      const review = await runSelfReview(session.connection, outcome.threadId, this.deps.logger);
      if (review) {
        input.onEvent(
          createLifecycleEvent({
            issue: input.issue,
            event: "self_review",
            message: review.passed
              ? `Self-review passed: ${review.summary}`
              : `Self-review flagged issues: ${review.summary}`,
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
