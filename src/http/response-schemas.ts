/**
 * Zod response schemas for API endpoints.
 *
 * These schemas define the shape of JSON response bodies.
 * Used for OpenAPI spec generation alongside the request schemas
 * in `./request-schemas.ts`.
 */

import { z } from "zod";

/** POST /api/v1/refresh — 202 response. */
export const refreshResponseSchema = z.object({
  queued: z.boolean(),
  coalesced: z.boolean(),
  requested_at: z.string(),
});

/** POST /api/v1/:issue_identifier/abort — success response. */
export const abortResponseSchema = z.object({
  ok: z.literal(true),
  status: z.literal("stopping"),
  already_stopping: z.boolean(),
  requested_at: z.string(),
});

/** POST /api/v1/:issue_identifier/transition — success response. */
export const transitionResponseSchema = z.object({
  ok: z.boolean(),
  from: z.string().optional(),
  to: z.string().optional(),
  reason: z.string().optional(),
});

/** Standard error envelope used across 4xx/5xx responses. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/** 400 validation error shape returned by `validateBody()` and friends. */
export const validationErrorSchema = z.object({
  error: z.literal("validation_error"),
  details: z.array(
    z.object({
      code: z.string(),
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

/** GET /api/v1/runtime — runtime info response. */
export const runtimeResponseSchema = z.object({
  version: z.string(),
  data_dir: z.string(),
  feature_flags: z.record(z.string(), z.unknown()),
  provider_summary: z.string(),
});

/** GET /api/v1/:issue_identifier/attempts — attempts list response. */
export const attemptsListResponseSchema = z.object({
  attempts: z.array(z.record(z.string(), z.unknown())),
  current_attempt_id: z.string().nullable(),
});
