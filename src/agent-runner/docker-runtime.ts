import { Liquid } from "liquidjs";

import { executeTurns } from "./turn-executor.js";
import { createTurnState, type TurnState } from "./turn-state.js";
import { createDockerSession, type DockerSession, type DockerSessionDeps } from "./docker-session.js";
import { initializeSession } from "./session-init.js";
import { runSelfReview, type SelfReviewResult } from "./self-review.js";
import type {
  CodexRuntimePort,
  CodexRuntimeSession,
  RuntimeExecuteInput,
  RuntimeInitInput,
  RuntimeInitResult,
  RuntimeStartInput,
} from "./codex-runtime-port.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import type { TrackerToolProvider } from "../tracker/tool-provider.js";
import type { TrackerPort } from "../tracker/port.js";
import type { ServiceConfig, RisolutoLogger } from "../core/types.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type { MetricsCollector } from "../observability/metrics.js";

interface DockerCodexRuntimePortDeps {
  getConfig: () => ServiceConfig;
  tracker: TrackerPort;
  trackerToolProvider: TrackerToolProvider;
  archiveDir?: string;
  pathRegistry?: PathRegistry;
  githubToolClient?: GithubApiToolClient;
  logger: RisolutoLogger;
  spawnProcess?: DockerSessionDeps["spawnProcess"];
  metrics?: MetricsCollector;
}

export class DockerCodexRuntimePort implements CodexRuntimePort {
  constructor(private readonly deps: DockerCodexRuntimePortDeps) {}

  async start(input: RuntimeStartInput): Promise<CodexRuntimeSession> {
    const config = this.deps.getConfig();
    const turnState = createTurnState();
    const dockerSession = await createDockerSession(
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
        trackerToolProvider: this.deps.trackerToolProvider,
        logger: this.deps.logger,
        spawnProcess: this.deps.spawnProcess,
        metrics: this.deps.metrics,
      },
      turnState,
      input.precomputedRuntimeConfig,
    );

    return new DockerCodexRuntimeSession(config, dockerSession, turnState, {
      tracker: this.deps.tracker,
      trackerToolProvider: this.deps.trackerToolProvider,
      logger: this.deps.logger,
    });
  }
}

class DockerCodexRuntimeSession implements CodexRuntimeSession {
  private readonly liquid = new Liquid({ strictFilters: true, strictVariables: true });

  constructor(
    private readonly config: ServiceConfig,
    private readonly session: DockerSession,
    private readonly turnState: TurnState,
    private readonly deps: {
      tracker: TrackerPort;
      trackerToolProvider: TrackerToolProvider;
      logger: RisolutoLogger;
    },
  ) {}

  async initialize(input: RuntimeInitInput): Promise<RuntimeInitResult> {
    return initializeSession(
      this.session,
      this.config,
      {
        ...input,
        startupTimeoutMs: this.config.codex.startupTimeoutMs,
        rollbackLastTurn: Boolean(input.previousThreadId),
        previousPrFeedback: input.previousPrFeedback ?? null,
      },
      {
        logger: this.deps.logger,
        trackerToolProvider: this.deps.trackerToolProvider,
      },
      this.liquid,
    );
  }

  async execute(input: RuntimeExecuteInput) {
    return executeTurns(
      {
        connection: this.session.connection,
        config: this.config,
        prompt: input.prompt,
        runInput: input,
        turnState: this.turnState,
        tracker: this.deps.tracker,
        setActiveTurnId: (turnId) => {
          this.session.turnId = turnId;
        },
        getLastAgentMessageContent: input.getLastAgentMessageContent,
        getLastStopSignal: input.getLastStopSignal,
        logger: this.deps.logger,
      },
      {
        threadId: this.session.threadId,
        turnId: null,
        turnCount: 0,
        containerName: this.session.containerName,
        exitPromise: this.session.exitPromise,
        getFatalFailure: this.session.getFatalFailure,
      },
    );
  }

  async review(threadId: string, signal: AbortSignal, timeoutMs: number): Promise<SelfReviewResult | null> {
    return runSelfReview(this.session.connection, this.turnState, threadId, this.deps.logger, signal, timeoutMs);
  }

  async steer(message: string): Promise<boolean> {
    return this.session.steerTurn(message);
  }

  async shutdown(signal: AbortSignal): Promise<void> {
    this.session.turnId = null;
    await this.session.cleanup(this.config, signal);
  }

  getThreadId(): string | null {
    return this.session.threadId;
  }

  getFatalFailure(): { code: string; message: string } | null {
    return this.session.getFatalFailure();
  }
}
