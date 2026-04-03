/**
 * Zod schema for the agent configuration subsection.
 */

import { z } from "zod";
import { mergePolicyConfigSchema } from "./pr-policy.js";

export const agentConfigSchema = z.object({
  maxConcurrentAgents: z.number().default(10),
  maxConcurrentAgentsByState: z.record(z.string(), z.number()).default({}),
  maxTurns: z.number().default(20),
  maxRetryBackoffMs: z.number().default(300000),
  maxContinuationAttempts: z.number().default(5),
  successState: z.string().nullable().default(null),
  stallTimeoutMs: z.number().default(1200000),
  preflightCommands: z.array(z.string()).default([]),

  /**
   * When true, detecting a "CHANGES_REQUESTED" review on an open PR
   * automatically queues a re-run with the review feedback injected
   * into the agent prompt. Off by default — explicit operator opt-in.
   */
  autoRetryOnReviewFeedback: z.boolean().default(false),

  /**
   * How frequently (in ms) the PR monitor polls open PRs for state
   * changes (merged, closed, review requested). Default: 60 seconds.
   * Must be at least 10 seconds to avoid GitHub API rate-limit pressure.
   */
  prMonitorIntervalMs: z.number().int().min(10000).default(60000),

  /**
   * Auto-merge policy. When `enabled` is false (the default), the engine
   * never requests auto-merge regardless of other fields.
   */
  autoMerge: mergePolicyConfigSchema.default({
    enabled: false,
    allowedPaths: [],
    requireLabels: [],
    excludeLabels: [],
  }),
});

/** Inferred type — always in sync with the schema, no manual maintenance needed. */
export type AgentConfig = z.infer<typeof agentConfigSchema>;
