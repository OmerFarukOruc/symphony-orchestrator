/**
 * Zod response schemas for API endpoints.
 *
 * These schemas define the shape of JSON response bodies.
 * Used for OpenAPI spec generation alongside the request schemas
 * in `./request-schemas.ts`.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Shared sub-schemas                                                  */
/* ------------------------------------------------------------------ */

const tokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
});

const reasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);

const recentEventSchema = z.object({
  at: z.string(),
  issueId: z.string().nullable(),
  issueIdentifier: z.string().nullable(),
  sessionId: z.string().nullable(),
  event: z.string(),
  message: z.string(),
  content: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const issueBlockerRefSchema = z.object({
  id: z.string().nullable(),
  identifier: z.string().nullable(),
  state: z.string().nullable(),
});

const modelSourceSchema = z.enum(["default", "override"]);

const serializedStateRecentEventSchema = z.object({
  at: z.string(),
  issue_id: z.string().nullable(),
  issue_identifier: z.string().nullable(),
  session_id: z.string().nullable(),
  event: z.string(),
  message: z.string(),
  content: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const serializedStateCodexTotalsSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  seconds_running: z.number(),
  cost_usd: z.number(),
});

const serializedStateStallEventSchema = z.object({
  at: z.string(),
  issue_id: z.string(),
  issue_identifier: z.string(),
  silent_ms: z.number(),
  timeout_ms: z.number(),
});

const serializedStateSystemHealthSchema = z.object({
  status: z.enum(["healthy", "degraded", "critical"]),
  checked_at: z.string(),
  running_count: z.number(),
  message: z.string(),
});

const serializedStateWebhookHealthSchema = z.object({
  status: z.string(),
  effective_interval_ms: z.number(),
  stats: z.object({
    deliveries_received: z.number(),
    last_delivery_at: z.string().nullable(),
    last_event_type: z.string().nullable(),
  }),
  last_delivery_at: z.string().nullable(),
  last_event_type: z.string().nullable(),
});

/** Shared shape for RuntimeIssueView used in state, issue detail, and snapshots. */
const runtimeIssueViewSchema = z.object({
  issueId: z.string(),
  identifier: z.string(),
  title: z.string(),
  state: z.string(),
  workspaceKey: z.string().nullable(),
  workspacePath: z.string().nullable().optional(),
  message: z.string().nullable(),
  status: z.string(),
  updatedAt: z.string(),
  attempt: z.number().nullable(),
  error: z.string().nullable(),
  priority: z.number().nullable().optional(),
  labels: z.array(z.string()).optional(),
  startedAt: z.string().nullable().optional(),
  lastEventAt: z.string().nullable().optional(),
  tokenUsage: tokenUsageSchema.nullable().optional(),
  model: z.string().nullable().optional(),
  reasoningEffort: reasoningEffortSchema.nullable().optional(),
  modelSource: modelSourceSchema.nullable().optional(),
  configuredModel: z.string().nullable().optional(),
  configuredReasoningEffort: reasoningEffortSchema.nullable().optional(),
  configuredModelSource: modelSourceSchema.nullable().optional(),
  modelChangePending: z.boolean().optional(),
  configuredTemplateId: z.string().nullable().optional(),
  configuredTemplateName: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  blockedBy: z.array(issueBlockerRefSchema).optional(),
  branchName: z.string().nullable().optional(),
  pullRequestUrl: z.string().nullable().optional(),
  nextRetryDueAt: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});

/* ------------------------------------------------------------------ */
/*  Existing schemas                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  New schemas — tightened for OpenAPI contract coverage                */
/* ------------------------------------------------------------------ */

/** GET /api/v1/transitions — available state transitions. */
export const transitionsListResponseSchema = z.object({
  transitions: z.record(z.string(), z.array(z.string())),
});

/** GET /api/v1/state — full runtime snapshot. */
export const stateResponseSchema = z.object({
  generated_at: z.string(),
  counts: z.object({
    running: z.number(),
    retrying: z.number(),
  }),
  running: z.array(runtimeIssueViewSchema),
  retrying: z.array(runtimeIssueViewSchema),
  queued: z.array(runtimeIssueViewSchema).optional(),
  completed: z.array(runtimeIssueViewSchema).optional(),
  workflow_columns: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      kind: z.enum(["backlog", "todo", "active", "gate", "terminal", "other"]),
      terminal: z.boolean(),
      count: z.number(),
      issues: z.array(runtimeIssueViewSchema),
    }),
  ),
  codex_totals: serializedStateCodexTotalsSchema,
  rate_limits: z.unknown(),
  recent_events: z.array(serializedStateRecentEventSchema),
  stall_events: z.array(serializedStateStallEventSchema).optional(),
  system_health: serializedStateSystemHealthSchema.optional(),
  webhook_health: serializedStateWebhookHealthSchema.optional(),
  available_models: z.array(z.string()).nullable().optional(),
});

/** GET /api/v1/{issue_identifier} — issue detail with attempts and events. */
export const issueDetailResponseSchema = runtimeIssueViewSchema.extend({
  recentEvents: z.array(recentEventSchema),
  attempts: z.array(z.record(z.string(), z.unknown())),
  currentAttemptId: z.string().nullable(),
});

const attemptSummarySchema = z.object({
  attemptId: z.string(),
  attemptNumber: z.number().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  status: z.string(),
  model: z.string(),
  reasoningEffort: reasoningEffortSchema.nullable(),
  tokenUsage: tokenUsageSchema.nullable(),
  costUsd: z.number().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  issueIdentifier: z.string().optional(),
  title: z.string().optional(),
  workspacePath: z.string().nullable().optional(),
  workspaceKey: z.string().nullable().optional(),
  modelSource: modelSourceSchema.optional(),
  turnCount: z.number().optional(),
  threadId: z.string().nullable().optional(),
  turnId: z.string().nullable().optional(),
});

/** GET /api/v1/attempts/{attempt_id} — attempt detail with events. */
export const attemptDetailResponseSchema = attemptSummarySchema.extend({
  events: z.array(recentEventSchema),
});

/** POST /api/v1/{issue_identifier}/model — 202 model updated. */
export const modelUpdateResponseSchema = z.object({
  updated: z.boolean(),
  restarted: z.boolean(),
  applies_next_attempt: z.boolean(),
  selection: z.object({
    model: z.string(),
    reasoning_effort: reasoningEffortSchema.nullable(),
    source: modelSourceSchema,
  }),
});

/* -- Workspace schemas ------------------------------------------------ */

const workspaceIssueSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  state: z.string(),
});

const workspaceEntrySchema = z.object({
  workspace_key: z.string(),
  path: z.string(),
  status: z.enum(["running", "retrying", "completed", "orphaned"]),
  strategy: z.string(),
  issue: workspaceIssueSchema.nullable(),
  disk_bytes: z.number().nullable(),
  last_modified_at: z.string().nullable(),
});

/** GET /api/v1/workspaces — workspace inventory. */
export const workspaceInventoryResponseSchema = z.object({
  workspaces: z.array(workspaceEntrySchema),
  generated_at: z.string(),
  total: z.number(),
  active: z.number(),
  orphaned: z.number(),
});

/* -- Git context schemas ---------------------------------------------- */

const gitPullViewSchema = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  state: z.string(),
  updatedAt: z.string(),
  url: z.string(),
  headBranch: z.string(),
  checksStatus: z.string().nullable(),
});

const gitCommitViewSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.string(),
});

const gitRepoViewSchema = z.object({
  repoUrl: z.string(),
  defaultBranch: z.string(),
  identifierPrefix: z.string().nullable(),
  label: z.string().nullable(),
  githubOwner: z.string().nullable(),
  githubRepo: z.string().nullable(),
  configured: z.boolean(),
  github: z
    .object({
      description: z.string().nullable(),
      visibility: z.string(),
      openPrCount: z.number(),
      pulls: z.array(gitPullViewSchema),
      recentCommits: z.array(gitCommitViewSchema),
    })
    .optional(),
});

const activeBranchViewSchema = z.object({
  identifier: z.string(),
  branchName: z.string(),
  status: z.string(),
  workspacePath: z.string().nullable(),
  issueTitle: z.string(),
  pullRequestUrl: z.string().nullable(),
});

/** GET /api/v1/git/context — git context response. */
export const gitContextResponseSchema = z.object({
  repos: z.array(gitRepoViewSchema),
  activeBranches: z.array(activeBranchViewSchema),
  githubAvailable: z.boolean(),
});

/* -- Config schemas --------------------------------------------------- */

/** GET /api/v1/config — effective configuration (freeform). */
export const configResponseSchema = z.record(z.string(), z.unknown());

/** GET /api/v1/config/schema — config schema descriptor. */
export const configSchemaResponseSchema = z.record(z.string(), z.unknown());

/** GET /api/v1/config/overlay — overlay read response. */
export const configOverlayGetResponseSchema = z.object({
  overlay: z.record(z.string(), z.unknown()),
});

/** PUT /api/v1/config/overlay — overlay write response. */
export const configOverlayPutResponseSchema = z.object({
  updated: z.boolean(),
  overlay: z.record(z.string(), z.unknown()),
});

/** PATCH /api/v1/config/overlay/{path} — overlay path set response. */
export const configOverlayPatchResponseSchema = z.object({
  updated: z.boolean(),
  overlay: z.record(z.string(), z.unknown()),
});

/* -- PR schemas ------------------------------------------------------ */

const prStatusSchema = z.enum(["open", "merged", "closed"]);

/** Shape of a single PR entry in the /api/v1/prs response. */
const prEntrySchema = z.object({
  issueId: z.string(),
  url: z.string(),
  number: z.number(),
  repo: z.string(),
  branchName: z.string(),
  status: prStatusSchema,
  mergedAt: z.string().nullable(),
  mergeCommitSha: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** GET /api/v1/prs — PR status overview. */
export const prsListResponseSchema = z.object({
  prs: z.array(prEntrySchema),
});

/* -- Checkpoint schemas ---------------------------------------------- */

const checkpointTriggerSchema = z.string();

const checkpointTokenUsageSchema = z
  .object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  })
  .nullable();

/** Shape of a single checkpoint entry. */
const checkpointEntrySchema = z.object({
  checkpointId: z.number(),
  attemptId: z.string(),
  ordinal: z.number(),
  trigger: checkpointTriggerSchema,
  eventCursor: z.number().nullable(),
  status: z.string(),
  threadId: z.string().nullable(),
  turnId: z.string().nullable(),
  turnCount: z.number(),
  tokenUsage: checkpointTokenUsageSchema,
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

/** GET /api/v1/attempts/:attempt_id/checkpoints — checkpoint history. */
export const checkpointsListResponseSchema = z.object({
  checkpoints: z.array(checkpointEntrySchema),
});

/* -- Config overlay put request -------------------------------------- */

/** PUT /api/v1/config/overlay — request body. */
export const configOverlayPutRequestSchema = z
  .object({
    patch: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());
