import type { ServiceConfig, SymphonyLogger } from "../core/types.js";
import { LinearClient } from "../linear/client.js";
import { LinearTrackerAdapter } from "./linear-adapter.js";
import type { TrackerPort } from "./port.js";

/**
 * Result of tracker factory — exposes both the abstract port (for orchestration)
 * and the concrete LinearClient (for MCP GraphQL tool / direct API calls).
 */
export interface TrackerFactoryResult {
  tracker: TrackerPort;
  linearClient: LinearClient;
}

/**
 * Creates the tracker subsystem from service config.
 * Encapsulates LinearClient instantiation and adapter wrapping so that
 * `services.ts` does not depend on tracker internals.
 */
export function createTracker(getConfig: () => ServiceConfig, logger: SymphonyLogger): TrackerFactoryResult {
  const linearClient = new LinearClient(getConfig, logger.child({ component: "linear" }));
  const tracker = new LinearTrackerAdapter(linearClient);
  return { tracker, linearClient };
}
