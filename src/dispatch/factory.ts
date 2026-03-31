import { AgentRunner } from "../agent-runner/index.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import type { LinearClient } from "../linear/client.js";
import type { TrackerPort } from "../tracker/port.js";
import type { ServiceConfig, RisolutoLogger } from "../core/types.js";
import type { PathRegistry } from "../workspace/path-registry.js";
import type { WorkspaceManager } from "../workspace/manager.js";
import { DispatchClient } from "./client.js";
import type { RunAttemptDispatcher } from "./types.js";

/**
 * Dependencies the dispatcher factory needs to construct either a local
 * AgentRunner or a remote DispatchClient.
 */
export interface DispatcherFactoryDeps {
  tracker: TrackerPort;
  linearClient: LinearClient | null;
  workspaceManager: WorkspaceManager;
  archiveDir: string;
  pathRegistry: PathRegistry;
  githubToolClient: GithubApiToolClient;
  logger: RisolutoLogger;
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
    return new DispatchClient({
      dispatchUrl: process.env.DISPATCH_URL ?? "http://data-plane:9100/dispatch", // NOSONAR — internal service-to-service on private network
      secret: process.env.DISPATCH_SHARED_SECRET ?? "",
      getConfig,
      logger: deps.logger.child({ component: "dispatch-client" }),
    });
  }

  return new AgentRunner({
    getConfig,
    tracker: deps.tracker,
    linearClient: deps.linearClient,
    workspaceManager: deps.workspaceManager,
    archiveDir: deps.archiveDir,
    pathRegistry: deps.pathRegistry,
    githubToolClient: deps.githubToolClient,
    logger: deps.logger.child({ component: "agent-runner" }),
  });
}
