/**
 * Zod request body schemas for POST endpoints.
 *
 * Each schema defines the expected shape of the request body for a given route.
 * Used with `validateBody()` from `./validation.js`.
 */

import { z } from "zod";

import type { ReasoningEffort } from "../core/types.js";

const REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

/**
 * POST /:issue_identifier/model
 *
 * Accepts both `reasoning_effort` (snake_case) and `reasoningEffort` (camelCase).
 * At least `model` is required; reasoning effort is optional.
 */
export const modelUpdateSchema = z
  .object({
    model: z.string().trim().min(1, "model is required"),
    reasoning_effort: z.enum(REASONING_EFFORT_VALUES).nullish(),
    reasoningEffort: z.enum(REASONING_EFFORT_VALUES).nullish(),
  })
  .strict();

export type ModelUpdateBody = z.infer<typeof modelUpdateSchema>;

/**
 * POST /:issue_identifier/transition
 *
 * Requires `target_state` as a non-empty string.
 */
export const transitionSchema = z
  .object({
    target_state: z.string().trim().min(1, "target_state is required"),
  })
  .strict();

export type TransitionBody = z.infer<typeof transitionSchema>;

/**
 * POST /:issue_identifier/steer
 *
 * Injects mid-turn guidance into a running agent session.
 */
export const steerSchema = z
  .object({
    message: z.string().min(1, "message is required"),
  })
  .strict();

/**
 * POST /:issue_identifier/template
 *
 * Sets a per-issue prompt template override.
 * `template_id` must reference an existing template in the template store.
 */
export const templateOverrideSchema = z
  .object({
    template_id: z.string().trim().min(1, "template_id is required"),
  })
  .strict();

export type TemplateOverrideBody = z.infer<typeof templateOverrideSchema>;
