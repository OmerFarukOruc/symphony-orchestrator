import { Type, type Static } from "@sinclair/typebox";

const NullableString = Type.Union([Type.String(), Type.Null()]);

export const ErrorEnvelopeSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
  }),
});

export const RuntimeResponseSchema = Type.Object({
  version: Type.String(),
  workflow_path: Type.String(),
  data_dir: Type.String(),
  feature_flags: Type.Record(Type.String(), Type.Boolean()),
  provider_summary: Type.String(),
});

export const RefreshResponseSchema = Type.Object({
  queued: Type.Boolean(),
  coalesced: Type.Boolean(),
  requested_at: Type.String(),
});

export const TokenTotalsSchema = Type.Object({
  input_tokens: Type.Number(),
  output_tokens: Type.Number(),
  total_tokens: Type.Number(),
  seconds_running: Type.Number(),
});

export const RuntimeIssueViewSchema = Type.Object({
  issueId: Type.String(),
  identifier: Type.String(),
  title: Type.String(),
  state: Type.String(),
  workspaceKey: Type.Union([Type.String(), Type.Null()]),
  workspacePath: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  message: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  updatedAt: Type.String(),
  attempt: Type.Union([Type.Number(), Type.Null()]),
  error: Type.Union([Type.String(), Type.Null()]),
  priority: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  labels: Type.Optional(Type.Array(Type.String())),
  startedAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  lastEventAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  tokenUsage: Type.Optional(Type.Unknown()),
  model: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  reasoningEffort: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  modelSource: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  configuredModel: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  configuredReasoningEffort: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  configuredModelSource: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  modelChangePending: Type.Optional(Type.Boolean()),
  url: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  blockedBy: Type.Optional(Type.Array(Type.Unknown())),
  branchName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  pullRequestUrl: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  nextRetryDueAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  createdAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export const RuntimeEventSchema = Type.Object({
  at: Type.String(),
  issue_id: NullableString,
  issue_identifier: NullableString,
  session_id: NullableString,
  event: Type.String(),
  message: Type.String(),
  content: Type.Optional(NullableString),
  metadata: Type.Optional(Type.Unknown()),
});

export const WorkflowColumnSchema = Type.Object({
  key: Type.String(),
  label: Type.String(),
  kind: Type.String(),
  terminal: Type.Boolean(),
  count: Type.Number(),
  issues: Type.Array(RuntimeIssueViewSchema),
});

export const RuntimeStateResponseSchema = Type.Object({
  generated_at: Type.String(),
  counts: Type.Object({
    running: Type.Number(),
    retrying: Type.Number(),
  }),
  queued: Type.Array(RuntimeIssueViewSchema),
  running: Type.Array(RuntimeIssueViewSchema),
  retrying: Type.Array(RuntimeIssueViewSchema),
  completed: Type.Array(RuntimeIssueViewSchema),
  workflow_columns: Type.Array(WorkflowColumnSchema),
  codex_totals: TokenTotalsSchema,
  rate_limits: Type.Unknown(),
  recent_events: Type.Array(RuntimeEventSchema),
  stall_events: Type.Optional(Type.Array(Type.Unknown())),
  system_health: Type.Optional(Type.Unknown()),
});

export const AbortResponseSchema = Type.Object({
  ok: Type.Boolean(),
  status: Type.String(),
  already_stopping: Type.Boolean(),
  requested_at: Type.String(),
});

export const AttemptListResponseSchema = Type.Object({
  attempts: Type.Array(Type.Unknown()),
  current_attempt_id: Type.Union([Type.String(), Type.Null()]),
});

export const OpenApiDocumentSchema = Type.Object({
  openapi: Type.String(),
  info: Type.Object({
    title: Type.String(),
    version: Type.String(),
  }),
  paths: Type.Record(Type.String(), Type.Unknown()),
});

export type ErrorEnvelope = Static<typeof ErrorEnvelopeSchema>;
export type RuntimeResponse = Static<typeof RuntimeResponseSchema>;
export type RefreshResponse = Static<typeof RefreshResponseSchema>;
export type RuntimeStateResponse = Static<typeof RuntimeStateResponseSchema>;
export type AbortResponse = Static<typeof AbortResponseSchema>;
export type AttemptListResponse = Static<typeof AttemptListResponseSchema>;
export type OpenApiDocument = Static<typeof OpenApiDocumentSchema>;
