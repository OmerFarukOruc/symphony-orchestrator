import { Liquid } from "liquidjs";

import { classifyRunError, failureOutcome, outcomeForAbort } from "./abort-outcomes.js";
import { createTurnState } from "./turn-state.js";
import { executeTurns } from "./turn-executor.js";
import { createDockerSession, type DockerSessionDeps } from "./docker-session.js";
import { initializeSession } from "./session-init.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import { LinearClient } from "../linear/client.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type {
  Issue,
  ModelSelection,
  RecentEvent,
  RunOutcome,
  ServiceConfig,
  SymphonyLogger,
  TokenUsageSnapshot,
  Workspace,
} from "../core/types.js";
import { WorkspaceManager } from "../workspace/manager.js";

export { extractItemContent } from "./helpers.js";

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
  }): Promise<RunOutcome> {
    const config = this.deps.getConfig();
    const logger = this.deps.logger.child({
      issueIdentifier: input.issue.identifier,
      workspacePath: input.workspace.path,
    });

    await this.deps.workspaceManager.prepareForAttempt(input.workspace);
    await this.deps.workspaceManager.runBeforeRun(input.workspace);

    const session = await createDockerSession(
      config,
      {
        issue: input.issue,
        modelSelection: input.modelSelection,
        workspace: input.workspace,
        signal: input.signal,
        onEvent: input.onEvent,
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
    );

    try {
      const initResult = await initializeSession(
        session,
        config,
        {
          issue: input.issue,
          attempt: input.attempt,
          modelSelection: input.modelSelection,
          workspace: input.workspace,
          promptTemplate: input.promptTemplate,
          signal: input.signal,
          onEvent: input.onEvent,
          startupTimeoutMs: config.codex.startupTimeoutMs,
        },
        { logger },
        this.liquid,
      );

      if ("kind" in initResult) {
        return initResult;
      }

      const { threadId, prompt } = initResult;
      const turnId: string | null = null;
      const turnCount = 0;

      return await executeTurns(
        {
          connection: session.connection,
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
          setActiveTurnId: (turnId) => {
            session.turnId = turnId;
          },
        },
        {
          threadId,
          turnId,
          turnCount,
          containerName: session.containerName,
          exitPromise: session.exitPromise,
          getFatalFailure: session.getFatalFailure,
        },
      );
    } catch (error) {
      const threadId = session.threadId;
      const turnId: string | null = null;
      const turnCount = 0;
      {
        const maybeFailureOutcome = failureOutcome(session.getFatalFailure(), threadId, turnId, turnCount);
        if (maybeFailureOutcome) {
          return maybeFailureOutcome;
        }
      }
      if (input.signal.aborted) {
        return outcomeForAbort(input.signal, threadId, turnId, turnCount);
      }
      return classifyRunError(error, threadId, turnId, turnCount);
    } finally {
      session.turnId = null;
      await session.cleanup(config, input.signal);
      await this.deps.workspaceManager.runAfterRun(input.workspace).catch((error) => {
        logger.warn({ error: String(error) }, "after_run hook failed");
      });
    }
  }
}
