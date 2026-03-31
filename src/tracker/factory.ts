import type { ServiceConfig, RisolutoLogger } from "../core/types.js";
import { GitHubIssuesClient } from "../github/issues-client.js";
import { LinearClient } from "../linear/client.js";
import { GitHubTrackerAdapter } from "./github-adapter.js";
import { LinearTrackerAdapter } from "./linear-adapter.js";
import type { TrackerPort } from "./port.js";

/**
 * Result of tracker factory — exposes both the abstract port (for orchestration)
 * and the concrete LinearClient (for MCP GraphQL tool / direct API calls).
 * `linearClient` is null when the tracker kind is not "linear".
 */
export interface TrackerFactoryResult {
  tracker: TrackerPort;
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
    return { tracker, linearClient: null };
  }

  const linearClient = new LinearClient(getConfig, logger.child({ component: "linear" }));
  const tracker = new LinearTrackerAdapter(linearClient);
  return { tracker, linearClient };
}
