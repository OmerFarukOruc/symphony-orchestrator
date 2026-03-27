/**
 * Zod schema for the agent configuration subsection.
 */

import { z } from "zod";

export const agentConfigSchema = z.object({
  maxConcurrentAgents: z.number().default(10),
  maxConcurrentAgentsByState: z.record(z.string(), z.number()).default({}),
  maxTurns: z.number().default(20),
  maxRetryBackoffMs: z.number().default(300000),
  maxContinuationAttempts: z.number().default(5),
  successState: z.string().nullable().default(null),
  stallTimeoutMs: z.number().default(1200000),
  preflightCommands: z.array(z.string()).default([]),
});
