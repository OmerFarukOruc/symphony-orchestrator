import { type DockerSessionDeps, type PrecomputedRuntimeConfig } from "./docker-session.js";
import { DefaultAttemptExecutor, type AttemptExecutor } from "./attempt-executor.js";
import type { CodexRuntimePort } from "./codex-runtime-port.js";
import { DockerCodexRuntimePort } from "./docker-runtime.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { RunAttemptDispatcher } from "../dispatch/types.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import type { TrackerToolProvider } from "../tracker/tool-provider.js";
import type { TrackerPort } from "../tracker/port.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, RisolutoLogger, Workspace } from "../core/types.js";
import { WorkspaceManager } from "../workspace/manager.js";
import { createMetricsCollector, type MetricsCollector } from "../observability/metrics.js";

export { extractItemContent } from "./helpers.js";

export type { AgentRunnerEventHandler } from "./contracts.js";

export class AgentRunner implements RunAttemptDispatcher {
  private readonly attemptExecutor: AttemptExecutor;

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
      runtimePort?: CodexRuntimePort;
      attemptExecutor?: AttemptExecutor;
    },
  ) {
    this.deps.metrics ??= createMetricsCollector();
    const runtimePort =
      this.deps.runtimePort ??
      new DockerCodexRuntimePort({
        getConfig: this.deps.getConfig,
        tracker: this.deps.tracker,
        trackerToolProvider: this.deps.trackerToolProvider,
        archiveDir: this.deps.archiveDir,
        pathRegistry: this.deps.pathRegistry,
        githubToolClient: this.deps.githubToolClient,
        logger: this.deps.logger,
        spawnProcess: this.deps.spawnProcess,
        metrics: this.deps.metrics,
      });

    this.attemptExecutor =
      this.deps.attemptExecutor ??
      new DefaultAttemptExecutor({
        getConfig: this.deps.getConfig,
        workspaceManager: this.deps.workspaceManager,
        runtimePort,
        logger: this.deps.logger,
      });
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
    const activeAttempt = await this.attemptExecutor.launch(input);
    input.onSteerReady?.((message: string) => activeAttempt.steer(message));
    return activeAttempt.outcome;
  }
}
