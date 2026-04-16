import { AgentRunner } from "../agent-runner/index.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import type { TrackerToolProvider } from "../tracker/tool-provider.js";
import type { TrackerPort } from "../tracker/port.js";
import type { ServiceConfig, RisolutoLogger } from "../core/types.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type { WorkspaceManager } from "../workspace/manager.js";
import { DispatchClient } from "./client.js";
import type { RunAttemptDispatcher } from "./types.js";
import type { MetricsCollector } from "../observability/metrics.js";

/**
 * Dependencies the dispatcher factory needs to construct either a local
 * AgentRunner or a remote DispatchClient.
 */
export interface DispatcherFactoryDeps {
  tracker: TrackerPort;
  trackerToolProvider: TrackerToolProvider;
  workspaceManager: WorkspaceManager;
  archiveDir: string;
  pathRegistry: PathRegistry;
  githubToolClient: GithubApiToolClient;
  logger: RisolutoLogger;
  metrics?: MetricsCollector;
}

/**
 * Creates a {@link RunAttemptDispatcher} based on the `DISPATCH_MODE` env var.
 *
 * - `"local"` (default): in-process {@link AgentRunner}
 * - `"remote"`: {@link DispatchClient} pointing at `DISPATCH_URL`
 */
export function createDispatcher(getConfig: () => ServiceConfig, deps: DispatcherFactoryDeps): RunAttemptDispatcher {
  const dispatchMode = process.env.DISPATCH_MODE ?? "local";

  if (dispatchMode === "remote") {
    const secret = process.env.DISPATCH_SHARED_SECRET?.trim();
    if (!secret) {
      throw new Error("DISPATCH_SHARED_SECRET is required when DISPATCH_MODE=remote");
    }

    return new DispatchClient({
      dispatchUrl: process.env.DISPATCH_URL ?? "http://data-plane:9100/dispatch",
      secret,
      getConfig,
      logger: deps.logger.child({ component: "dispatch-client" }),
    });
  }

  return new AgentRunner({
    getConfig,
    tracker: deps.tracker,
    trackerToolProvider: deps.trackerToolProvider,
    workspaceManager: deps.workspaceManager,
    archiveDir: deps.archiveDir,
    pathRegistry: deps.pathRegistry,
    githubToolClient: deps.githubToolClient,
    logger: deps.logger.child({ component: "agent-runner" }),
    metrics: deps.metrics,
  });
}
