/**
 * Zod schema for the PR merge policy configuration subsection.
 *
 * Controls whether auto-merge is enabled and which rules gate it.
 * All fields are optional with safe defaults so the block is fully
 * backward-compatible when absent from the operator config file.
 */

import { z } from "zod";

export const mergePolicyConfigSchema = z.object({
  /** When false (default), auto-merge is never requested — safe opt-in only. */
  enabled: z.boolean().default(false),

  /**
   * Allowed path prefixes. When non-empty, ALL changed files must match
   * at least one prefix. An empty array means no path restriction.
   */
  allowedPaths: z.array(z.string()).default([]),

  /**
   * Maximum number of changed files permitted. Null = no limit.
   */
  maxChangedFiles: z.number().int().nullable().optional(),

  /**
   * Maximum total diff lines (additions + deletions) permitted. Null = no limit.
   */
  maxDiffLines: z.number().int().nullable().optional(),

  /**
   * Labels that MUST all be present on the PR before auto-merge is attempted.
   * An empty array means no required labels.
   */
  requireLabels: z.array(z.string()).default([]),

  /**
   * Labels that MUST NOT be present on the PR. Any match blocks auto-merge.
   * An empty array means no excluded labels.
   */
  excludeLabels: z.array(z.string()).default([]),
});
