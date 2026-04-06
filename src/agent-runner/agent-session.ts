import { Liquid } from "liquidjs";

import { executeTurns } from "./turn-executor.js";
import { createTurnState } from "./turn-state.js";
import {
  createDockerSession,
  type DockerSession,
  type DockerSessionDeps,
  type PrecomputedRuntimeConfig,
} from "./docker-session.js";
import { initializeSession, type EarlyOutcome, type SessionInitSuccess } from "./session-init.js";
import { runSelfReview, type SelfReviewResult } from "./self-review.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { TrackerToolProvider } from "../tracker/tool-provider.js";
import type { TrackerPort } from "../tracker/port.js";
import type { Issue, ModelSelection, RunOutcome, ServiceConfig, RisolutoLogger, Workspace } from "../core/types.js";

export interface AgentSessionCreateInput {
  issue: Issue;
  modelSelection: ModelSelection;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  precomputedRuntimeConfig?: PrecomputedRuntimeConfig;
}

export interface AgentSessionInitInput {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  workspace: Workspace;
  promptTemplate: string;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  previousThreadId?: string | null;
  previousPrFeedback?: string | null;
}

export interface AgentSessionExecuteInput {
  issue: Issue;
  attempt: number | null;
  modelSelection: ModelSelection;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
  prompt: string;
  getLastAgentMessageContent: () => string | null;
  getLastStopSignal?: () => import("../core/signal-detection.js").StopSignal | null;
}

export class AgentSession {
  private readonly liquid = new Liquid({ strictFilters: true, strictVariables: true });
  private readonly turnState = createTurnState();
  private dockerSession: DockerSession | null = null;

  constructor(
    private readonly config: ServiceConfig,
    private readonly deps: {
      tracker: TrackerPort;
      trackerToolProvider: TrackerToolProvider;
      logger: RisolutoLogger;
    } & DockerSessionDeps,
  ) {}

  get steerTurn(): ((message: string) => Promise<boolean>) | null {
    return this.dockerSession?.steerTurn ?? null;
  }

  get threadId(): string | null {
    return this.dockerSession?.threadId ?? null;
  }

  get turnId(): string | null {
    return this.dockerSession?.turnId ?? null;
  }

  get containerName(): string | null {
    return this.dockerSession?.containerName ?? null;
  }

  get exitPromise(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> | null {
    return this.dockerSession?.exitPromise ?? null;
  }

  getFatalFailure(): { code: string; message: string } | null {
    return this.dockerSession?.getFatalFailure() ?? null;
  }

  async start(input: AgentSessionCreateInput): Promise<void> {
    this.dockerSession = await createDockerSession(
      this.config,
      {
        issue: input.issue,
        modelSelection: input.modelSelection,
        workspace: input.workspace,
        signal: input.signal,
        onEvent: input.onEvent,
      },
      this.deps,
      this.turnState,
      input.precomputedRuntimeConfig,
    );
  }

  async initialize(input: AgentSessionInitInput): Promise<SessionInitSuccess | EarlyOutcome> {
    const session = this.requireSession();
    return initializeSession(
      session,
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

  async executeTurns(input: AgentSessionExecuteInput): Promise<RunOutcome> {
    const session = this.requireSession();
    return executeTurns(
      {
        connection: session.connection,
        config: this.config,
        prompt: input.prompt,
        runInput: input,
        turnState: this.turnState,
        tracker: this.deps.tracker,
        setActiveTurnId: (turnId) => {
          session.turnId = turnId;
        },
        getLastAgentMessageContent: input.getLastAgentMessageContent,
        getLastStopSignal: input.getLastStopSignal,
        logger: this.deps.logger,
      },
      {
        threadId: session.threadId,
        turnId: null,
        turnCount: 0,
        containerName: session.containerName,
        exitPromise: session.exitPromise,
        getFatalFailure: session.getFatalFailure,
      },
    );
  }

  async selfReview(threadId: string, signal: AbortSignal, timeoutMs: number): Promise<SelfReviewResult | null> {
    const session = this.requireSession();
    return runSelfReview(session.connection, this.turnState, threadId, this.deps.logger, signal, timeoutMs);
  }

  async cleanup(signal: AbortSignal): Promise<void> {
    if (!this.dockerSession) {
      return;
    }
    this.dockerSession.turnId = null;
    await this.dockerSession.cleanup(this.config, signal);
  }

  private requireSession(): DockerSession {
    if (!this.dockerSession) {
      throw new Error("agent session has not been started");
    }
    return this.dockerSession;
  }
}
