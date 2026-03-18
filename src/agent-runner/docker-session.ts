import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { handleNotification } from "./notification-handler.js";
import { composeSessionId } from "./turn-state.js";
import type { TurnState } from "./turn-state.js";
import { createSuccessResponse, type JsonRpcRequest } from "../codex-protocol.js";
import { JsonRpcConnection } from "../agent/json-rpc-connection.js";
import { prepareCodexRuntimeConfig, getRequiredProviderEnvNames } from "../codex-runtime-config.js";
import { buildDockerRunArgs } from "../docker-spawn.js";
import { removeContainer, stopContainer } from "../docker-lifecycle.js";
import { getContainerStats } from "../docker-stats.js";
import { handleCodexRequest } from "../agent/codex-request-handler.js";
import type { GithubApiToolClient } from "../github-api-tool.js";
import type { LinearClient } from "../linear-client.js";
import type { PathRegistry } from "../path-registry.js";
import type { AgentRunnerEventHandler } from "../agent-runner.js";
import type { Issue, ModelSelection, ServiceConfig, SymphonyLogger, Workspace } from "../types.js";

export interface DockerSessionDeps {
  archiveDir?: string;
  pathRegistry?: PathRegistry;
  githubToolClient?: GithubApiToolClient;
  linearClient: LinearClient;
  logger: SymphonyLogger;
  spawnProcess?: typeof spawn;
}

export interface DockerSessionInput {
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
  exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  getFatalFailure: () => { code: string; message: string } | null;
  cleanup: (config: ServiceConfig, signal: AbortSignal) => Promise<void>;
}

export async function createDockerSession(
  config: ServiceConfig,
  input: DockerSessionInput,
  deps: DockerSessionDeps,
  turnState: TurnState,
): Promise<DockerSession> {
  const logger = deps.logger.child({
    issueIdentifier: input.issue.identifier,
    workspacePath: input.workspace.path,
  });

  const spawnProcess = deps.spawnProcess ?? spawn;
  const runtimeConfig = await prepareCodexRuntimeConfig(config.codex);
  const archiveDir = deps.archiveDir ?? path.join(process.cwd(), "archive");
  await mkdir(archiveDir, { recursive: true });

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

  const containerName = docker.containerName;
  const child: ChildProcessWithoutNullStreams = spawnProcess(docker.program, docker.args, {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let fatalFailure: { code: string; message: string } | null = null;
  const turnId: string | null = null;

  const session: DockerSession = {
    child,
    connection: null as unknown as JsonRpcConnection,
    containerName,
    threadId: null,
    exitPromise: new Promise((resolve) => {
      child.once("exit", (code, sig) => resolve({ code, signal: sig }));
    }),
    getFatalFailure: () => fatalFailure,
    cleanup: async (cfg: ServiceConfig, signal: AbortSignal) => {
      clearInterval(statsInterval);
      signal.removeEventListener("abort", abortHandler);
      if (!signal.aborted && cfg.codex.drainTimeoutMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, cfg.codex.drainTimeoutMs));
      }
      session.connection.close();
      await stopContainer(containerName, 5);
      await Promise.race([session.exitPromise, new Promise((resolve) => setTimeout(resolve, 5000))]).catch(
        () => undefined,
      );
      await removeContainer(containerName);
    },
  };

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
      handleNotification({
        state: turnState,
        notification,
        issue: input.issue,
        threadId: session.threadId,
        turnId,
        onEvent: input.onEvent,
      });
    },
  );

  const abortHandler = () => {
    session.connection.close();
    void stopContainer(containerName, 5);
  };
  input.signal.addEventListener("abort", abortHandler, { once: true });

  const statsIntervalMs = 30_000;
  const statsInterval = setInterval(async () => {
    try {
      const stats = await getContainerStats(containerName);
      if (stats) {
        input.onEvent({
          at: new Date().toISOString(),
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          sessionId: composeSessionId(session.threadId, turnId),
          event: "container_stats",
          message: `CPU ${stats.cpuPercent} | MEM ${stats.memoryUsage}/${stats.memoryLimit} (${stats.memoryPercent})`,
        });
      }
    } catch {
      // intentionally swallowed — stats are best-effort
    }
  }, statsIntervalMs);

  return session;
}
