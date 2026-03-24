import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { asRecord, asString } from "./helpers.js";
import { handleNotification } from "./notification-handler.js";
import { composeSessionId } from "./turn-state.js";
import type { TurnState } from "./turn-state.js";
import { createSuccessResponse, type JsonRpcRequest } from "../codex/protocol.js";
import { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import { prepareCodexRuntimeConfig, getRequiredProviderEnvNames } from "../codex/runtime-config.js";
import { buildDockerRunArgs } from "../docker/spawn.js";
import { inspectContainerRunning, removeContainer, removeVolume, stopContainer } from "../docker/lifecycle.js";
import { getContainerStats } from "../docker/stats.js";
import { handleCodexRequest } from "../agent/codex-request-handler.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import type { LinearClient } from "../linear/client.js";
import { globalMetrics } from "../observability/metrics.js";
import { createLifecycleEvent } from "../orchestrator/lifecycle-events.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type { AgentRunnerEventHandler } from "./contracts.js";
import type { Issue, ModelSelection, ServiceConfig, SymphonyLogger, Workspace } from "../core/types.js";

function parsePercent(value: string): number {
  const parsed = Number.parseFloat(value.replaceAll("%", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

import type { PrecomputedRuntimeConfig } from "../dispatch/types.js";

export type { PrecomputedRuntimeConfig } from "../dispatch/types.js";

export interface DockerSessionDeps {
  archiveDir?: string;
  pathRegistry?: PathRegistry;
  githubToolClient?: GithubApiToolClient;
  linearClient: LinearClient;
  logger: SymphonyLogger;
  spawnProcess?: typeof spawn;
}

interface DockerSessionInput {
  issue: Issue;
  modelSelection: ModelSelection;
  workspace: Workspace;
  signal: AbortSignal;
  onEvent: AgentRunnerEventHandler;
}

export interface DockerSession {
  child: ChildProcessWithoutNullStreams;
  connection: JsonRpcConnection;
  containerName: string;
  threadId: string | null;
  turnId: string | null;
  exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  getFatalFailure: () => { code: string; message: string } | null;
  inspectRunning: () => Promise<boolean | null>;
  cleanup: (config: ServiceConfig, signal: AbortSignal) => Promise<void>;
}

export async function createDockerSession(
  config: ServiceConfig,
  input: DockerSessionInput,
  deps: DockerSessionDeps,
  turnState: TurnState,
  precomputedRuntimeConfig?: PrecomputedRuntimeConfig,
): Promise<DockerSession> {
  const spawnProcess = deps.spawnProcess ?? spawn;
  const runtimeConfig = precomputedRuntimeConfig ?? (await prepareCodexRuntimeConfig(config.codex));
  const archiveDir = deps.archiveDir ?? path.join(process.cwd(), "archive");
  await mkdir(archiveDir, { recursive: true });

  input.onEvent(
    createLifecycleEvent({
      issue: input.issue,
      event: "container_starting",
      message: "Starting sandbox container",
      metadata: {
        image: config.codex.sandbox.image,
        workspacePath: input.workspace.path,
        model: input.modelSelection.model,
      },
    }),
  );

  const docker = buildDockerRunArgs({
    sandboxConfig: config.codex.sandbox,
    runId: `${input.issue.identifier}-${Date.now()}`,
    command: config.codex.command,
    workspacePath: input.workspace.path,
    archiveDir,
    pathRegistry: deps.pathRegistry,
    runtimeConfigToml: runtimeConfig.configToml,
    runtimeAuthJsonBase64: runtimeConfig.authJsonBase64,
    requiredEnv: getRequiredProviderEnvNames(config.codex),
    issueIdentifier: input.issue.identifier,
    model: input.modelSelection.model,
  });

  const child: ChildProcessWithoutNullStreams = spawnProcess(docker.program, docker.args, {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const session = buildDockerSessionObject(child, docker, input, {
    inspectRunning: spawnProcess === spawn ? () => inspectContainerRunning(docker.containerName) : async () => true,
  });
  setupConnection(session, child, config, input, deps, turnState);
  startStatsPolling(session, input);

  return session;
}

function buildDockerSessionObject(
  child: ChildProcessWithoutNullStreams,
  docker: { containerName: string; cacheVolumeName: string },
  input: DockerSessionInput,
  helpers: {
    inspectRunning: () => Promise<boolean | null>;
  },
): DockerSession & { abortHandler: () => void; statsInterval: ReturnType<typeof setInterval> | null } {
  const fatalFailure: { code: string; message: string } | null = null;
  const containerName = docker.containerName;
  const cacheVolumeName = docker.cacheVolumeName;

  const session: DockerSession & { abortHandler: () => void; statsInterval: ReturnType<typeof setInterval> | null } = {
    child,
    connection: null as unknown as JsonRpcConnection,
    containerName,
    threadId: null,
    turnId: null,
    exitPromise: new Promise((resolve) => {
      child.once("exit", (code, sig) => resolve({ code, signal: sig }));
    }),
    getFatalFailure: () => fatalFailure,
    inspectRunning: helpers.inspectRunning,
    abortHandler: () => {
      session.connection.close();
      void stopContainer(containerName, 5);
    },
    statsInterval: null,
    cleanup: async (cfg: ServiceConfig, signal: AbortSignal) => {
      if (session.statsInterval) clearInterval(session.statsInterval);
      signal.removeEventListener("abort", session.abortHandler);
      if (!signal.aborted && cfg.codex.drainTimeoutMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, cfg.codex.drainTimeoutMs));
      }
      session.connection.close();
      await stopContainer(containerName, 5);
      await Promise.race([session.exitPromise, new Promise((resolve) => setTimeout(resolve, 5000))]).catch(
        () => undefined,
      );
      await removeContainer(containerName);
      await removeVolume(cacheVolumeName);
    },
  };

  input.signal.addEventListener("abort", session.abortHandler, { once: true });
  return session;
}

function setupConnection(
  session: DockerSession,
  child: ChildProcessWithoutNullStreams,
  config: ServiceConfig,
  input: DockerSessionInput,
  deps: DockerSessionDeps,
  turnState: TurnState,
): void {
  const logger = deps.logger.child({
    issueIdentifier: input.issue.identifier,
    workspacePath: input.workspace.path,
  });
  let fatalFailure: { code: string; message: string } | null = null;

  session.connection = new JsonRpcConnection(
    child,
    logger,
    config.codex.readTimeoutMs,
    async (request: JsonRpcRequest) => {
      const result = await handleCodexRequest(request, deps.linearClient, deps.githubToolClient);
      if (result.fatalFailure) {
        fatalFailure = result.fatalFailure;
        session.connection.close();
        return;
      }
      if (result.response !== undefined) {
        child.stdin.write(`${JSON.stringify(createSuccessResponse(request.id, result.response))}\n`);
      }
    },
    (notification) => {
      if (notification.method === "turn/started") {
        const turn = asRecord(asRecord(notification.params).turn);
        session.turnId = asString(turn.id) ?? session.turnId;
      }
      handleNotification({
        state: turnState,
        notification,
        issue: input.issue,
        threadId: session.threadId,
        turnId: session.turnId,
        onEvent: input.onEvent,
      });
    },
  );

  // Attach the fatalFailure getter to the session
  const originalGetFatalFailure = session.getFatalFailure;
  session.getFatalFailure = () => fatalFailure ?? originalGetFatalFailure();
}

function startStatsPolling(
  session: DockerSession & { statsInterval: ReturnType<typeof setInterval> | null },
  input: DockerSessionInput,
): void {
  const statsIntervalMs = 30_000;
  session.statsInterval = setInterval(async () => {
    try {
      const stats = await getContainerStats(session.containerName);
      if (stats) {
        input.onEvent({
          at: new Date().toISOString(),
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          sessionId: composeSessionId(session.threadId, session.turnId),
          event: "container_stats",
          message: `CPU ${stats.cpuPercent} | MEM ${stats.memoryUsage}/${stats.memoryLimit} (${stats.memoryPercent})`,
        });
        globalMetrics.containerCpuPercent.set(parsePercent(stats.cpuPercent), { issue: input.issue.identifier });
        globalMetrics.containerMemoryPercent.set(parsePercent(stats.memoryPercent), { issue: input.issue.identifier });
      }
    } catch {
      // intentionally swallowed — stats are best-effort
    }
  }, statsIntervalMs);
}
