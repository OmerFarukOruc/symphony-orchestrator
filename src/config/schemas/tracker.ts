/**
 * Zod schema for the tracker configuration subsection.
 */

import { z } from "zod";
import { DEFAULT_ACTIVE_STATES, DEFAULT_TERMINAL_STATES } from "../../state/policy.js";

export const trackerConfigSchema = z.object({
  kind: z.string().default("linear"),
  apiKey: z.string().default(""),
  endpoint: z.string().default("https://api.linear.app/graphql"),
  projectSlug: z.string().nullable().default(null),
  activeStates: z.array(z.string()).default(DEFAULT_ACTIVE_STATES),
  terminalStates: z.array(z.string()).default(DEFAULT_TERMINAL_STATES),
});
