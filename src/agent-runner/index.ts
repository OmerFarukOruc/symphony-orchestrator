import { Liquid } from "liquidjs";

import { classifyRunError, failureOutcome, outcomeForAbort } from "./abort-outcomes.js";
import { createTurnState } from "./turn-state.js";
import { executeTurns } from "./turn-executor.js";
import { createDockerSession, type DockerSessionDeps, type PrecomputedRuntimeConfig } from "./docker-session.js";
import { initializeSession } from "./session-init.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import type { LinearClient } from "../linear/client.js";
import type { TrackerPort } from "../tracker/port.js";
import { createLifecycleEvent, toErrorMessage } from "../orchestrator/lifecycle-events.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, SymphonyLogger, Workspace } from "../core/types.js";
import { WorkspaceManager } from "../workspace/manager.js";

export { extractItemContent } from "./helpers.js";

export type { AgentRunnerEventHandler } from "./contracts.js";

export class AgentRunner {
  private readonly liquid = new Liquid({ strictFilters: true, strictVariables: true });
  private readonly turnState = createTurnState();

  constructor(
    private readonly deps: {
      getConfig: () => ServiceConfig;
      tracker: TrackerPort;
      linearClient: LinearClient;
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
    /** Pre-computed runtime config for data plane (skips auth.json read) */
    precomputedRuntimeConfig?: PrecomputedRuntimeConfig;
  }): Promise<RunOutcome> {
    const config = this.deps.getConfig();
    const logger = this.deps.logger.child({
      issueIdentifier: input.issue.identifier,
      workspacePath: input.workspace.path,
    });

    await this.deps.workspaceManager.prepareForAttempt(input.workspace);
    await this.deps.workspaceManager.runBeforeRun(input.workspace, input.issue.identifier);

    // Track the latest agent message content for early stop-signal detection.
    // This wrapper MUST be created before the Docker session so the
    // session's notification pipeline flows through it.
    let lastAgentMessageContent: string | null = null;
    const wrappedOnEvent: AgentRunnerEventHandler = (event) => {
      if (event.event === "item_completed" && event.message?.includes("agentMessage") && event.content) {
        lastAgentMessageContent = event.content;
      }
      input.onEvent(event);
    };
    const wrappedInput = { ...input, onEvent: wrappedOnEvent };

    let session: Awaited<ReturnType<typeof createDockerSession>>;
    try {
      session = await createDockerSession(
        config,
        buildDockerInput(wrappedInput),
        buildDockerDeps(this.deps),
        this.turnState,
        input.precomputedRuntimeConfig,
      );
    } catch (error) {
      wrappedInput.onEvent(
        createLifecycleEvent({
          issue: input.issue,
          event: "container_failed",
          message: "Sandbox container failed to start",
          metadata: {
            error: toErrorMessage(error),
            workspacePath: input.workspace.path,
          },
        }),
      );
      throw error;
    }

    try {
      return await this.executeSession(session, config, wrappedInput, () => lastAgentMessageContent);
    } catch (error) {
      return handleRunError(error, session, input.signal);
    } finally {
      session.turnId = null;
      await session.cleanup(config, input.signal);
      await this.deps.workspaceManager.runAfterRun(input.workspace, input.issue.identifier).catch((error) => {
        logger.warn({ error: String(error) }, "after_run hook failed");
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
    },
    getLastAgentMessageContent: () => string | null,
  ): Promise<RunOutcome> {
    const initResult = await initializeSession(
      session,
      config,
      { ...input, startupTimeoutMs: config.codex.startupTimeoutMs },
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
    return executeTurns(
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

function buildDockerInput(input: {
  issue: Issue;
  modelSelection: ModelSelection;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
}) {
  return {
    issue: input.issue,
    modelSelection: input.modelSelection,
    workspace: input.workspace,
    signal: input.signal,
    onEvent: input.onEvent,
  };
}

function buildDockerDeps(deps: AgentRunner["deps"]): DockerSessionDeps {
  return {
    archiveDir: deps.archiveDir,
    pathRegistry: deps.pathRegistry,
    githubToolClient: deps.githubToolClient,
    linearClient: deps.linearClient,
    logger: deps.logger,
    spawnProcess: deps.spawnProcess,
  };
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
