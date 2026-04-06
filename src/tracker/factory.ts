import type { ServiceConfig, RisolutoLogger } from "../core/types.js";
import { GitHubIssuesClient } from "../github/issues-client.js";
import { LinearClient } from "../linear/client.js";
import { LinearTrackerToolProvider } from "../linear/tool-provider.js";
import { GitHubTrackerAdapter } from "./github-adapter.js";
import { LinearTrackerAdapter } from "./linear-adapter.js";
import type { TrackerPort } from "./port.js";
import { NullTrackerToolProvider, type TrackerToolProvider } from "./tool-provider.js";

/**
 * Result of tracker factory — exposes both the abstract port (for orchestration)
 * and a tracker tool provider for Codex dynamic tool dispatch.
 *
 * `trackerToolProvider` abstracts away which tracker is active so that
 * the agent-runner and dispatch layers never need to import LinearClient
 * directly.
 *
 * `linearClient` is retained for webhook infrastructure (registrar, health
 * tracker) which requires direct Linear API access. It is null when the
 * tracker kind is not "linear".
 */
export interface TrackerFactoryResult {
  tracker: TrackerPort;
  trackerToolProvider: TrackerToolProvider;
  /**
   * Retained for webhook infrastructure (registrar, health tracker) which requires
   * direct Linear API access. Null when the tracker kind is not "linear".
   * For Codex tool dispatch, use `trackerToolProvider` instead.
   */
  linearClient: LinearClient | null;
}

/**
 * Creates the tracker subsystem from service config.
 * Supports "linear" (default) and "github" tracker kinds.
 * Encapsulates client instantiation and adapter wrapping so that
 * `services.ts` does not depend on tracker internals.
 */
export function createTracker(getConfig: () => ServiceConfig, logger: RisolutoLogger): TrackerFactoryResult {
  const config = getConfig();

  if (config.tracker.kind === "github") {
    const client = new GitHubIssuesClient(getConfig, logger.child({ component: "github" }));
    const tracker = new GitHubTrackerAdapter(client, getConfig);
    return { tracker, trackerToolProvider: new NullTrackerToolProvider(), linearClient: null };
  }

  const linearClient = new LinearClient(getConfig, logger.child({ component: "linear" }));
  const tracker = new LinearTrackerAdapter(linearClient);
  return { tracker, trackerToolProvider: new LinearTrackerToolProvider(linearClient), linearClient };
}
