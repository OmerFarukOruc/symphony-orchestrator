/**
 * Drizzle ORM schema for Risoluto's SQLite persistence layer.
 *
 * Tables mirror the in-memory `AttemptRecord` and `AttemptEvent` types
 * from `src/core/types.ts`, providing queryable, durable storage for
 * cost tracking, trend analysis, and crash recovery.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Stores attempt records — one row per agent execution attempt.
 * Column names use snake_case to follow SQLite conventions;
 * the application layer maps to/from camelCase TypeScript types.
 */
export const attempts = sqliteTable("attempts", {
  attemptId: text("attempt_id").primaryKey(),
  issueId: text("issue_id").notNull(),
  issueIdentifier: text("issue_identifier").notNull(),
  title: text("title").notNull(),
  workspaceKey: text("workspace_key"),
  workspacePath: text("workspace_path"),
  status: text("status", {
    enum: ["running", "completed", "failed", "timed_out", "stalled", "cancelled", "paused"],
  }).notNull(),
  attemptNumber: integer("attempt_number"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  model: text("model").notNull(),
  reasoningEffort: text("reasoning_effort", {
    enum: ["none", "minimal", "low", "medium", "high", "xhigh"],
  }),
  modelSource: text("model_source", {
    enum: ["default", "override"],
  }).notNull(),
  threadId: text("thread_id"),
  turnId: text("turn_id"),
  turnCount: integer("turn_count").notNull().default(0),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  pullRequestUrl: text("pull_request_url"),
  stopSignal: text("stop_signal", {
    enum: ["done", "blocked"],
  }),
  /** Agent-authored markdown summary stored after generation, before PR creation. */
  summary: text("summary"),
});

/**
 * Stores individual attempt events as rows (one event per row).
 * The `metadata` column holds arbitrary JSON for extensibility.
 */
export const attemptEvents = sqliteTable("attempt_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => attempts.attemptId),
  timestamp: text("timestamp").notNull(),
  issueId: text("issue_id"),
  issueIdentifier: text("issue_identifier"),
  sessionId: text("session_id"),
  type: text("type").notNull(),
  message: text("message").notNull(),
  content: text("content"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  metadata: text("metadata"),
});

/**
 * Maps issues to their latest attempt state for fast lookups.
 * Acts as a materialized index: one row per issue identifier.
 */
export const issueIndex = sqliteTable("issue_index", {
  issueIdentifier: text("issue_identifier").primaryKey(),
  issueId: text("issue_id").notNull(),
  latestAttemptId: text("latest_attempt_id").references(() => attempts.attemptId),
  latestStatus: text("latest_status"),
  attemptCount: integer("attempt_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Dashboard-first config tables (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Section-based config store. Each row holds a JSON-serialized config
 * section (e.g., "tracker", "codex", "workspace"). The keys map 1:1
 * to the sections consumed by `deriveServiceConfig()`.
 */
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Per-key encrypted secrets. Key names are stored in plaintext;
 * values are AES-256-GCM encrypted with individual IV + authTag.
 */
export const encryptedSecrets = sqliteTable("encrypted_secrets", {
  key: text("key").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Prompt templates for agent instructions. The active template is
 * determined by `config.system.selectedTemplateId`, not an isDefault column.
 */
export const promptTemplates = sqliteTable("prompt_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Per-issue model and template overrides.
 * One row per issue identifier; all override columns are nullable so
 * the orchestrator falls back to global defaults when they are absent.
 */
export const issueConfig = sqliteTable("issue_config", {
  identifier: text("identifier").primaryKey(),
  templateId: text("template_id"),
  model: text("model"),
  reasoningEffort: text("reasoning_effort", {
    enum: ["none", "minimal", "low", "medium", "high", "xhigh"],
  }),
});

/**
 * Audit log for config, secret, and template mutations.
 * Stores both old and new values for diffing. Secret values are
 * recorded as the literal string "[REDACTED]".
 */
export const configHistory = sqliteTable("config_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tableName: text("table_name").notNull(),
  key: text("key").notNull(),
  path: text("path"),
  operation: text("operation").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  actor: text("actor").notNull().default("dashboard"),
  requestId: text("request_id"),
  timestamp: text("timestamp").notNull(),
});

/**
 * Durable webhook inbox — persists verified Linear deliveries BEFORE
 * returning 200. Serves as the foundation for dedup, retry, DLQ,
 * and audit trail.
 *
 * delivery_id is the unique Linear-Delivery header UUID.
 * status tracks the lifecycle: received → processing → applied | ignored | retry | dead_letter
 */
/**
 * Per-attempt checkpoint history — append-only, ordered by `ordinal`.
 *
 * Checkpoints are written at key lifecycle boundaries:
 * - `attempt_created` — when the attempt row is first persisted.
 * - `cursor_advanced` — when the thread or turn cursor advances.
 * - `status_transition` — when the attempt status changes.
 * - `terminal_completion` — when the attempt reaches a terminal state.
 * - `pr_merged` — when the associated PR is merged.
 *
 * `event_cursor` is a loose integer high-water mark into `attempt_events.id`
 * at the time of the write — not a FK constraint.
 */
export const attemptCheckpoints = sqliteTable("attempt_checkpoints", {
  checkpointId: integer("checkpoint_id").primaryKey({ autoIncrement: true }),
  attemptId: text("attempt_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  trigger: text("trigger").notNull(),
  eventCursor: integer("event_cursor"),
  status: text("status").notNull(),
  threadId: text("thread_id"),
  turnId: text("turn_id"),
  turnCount: integer("turn_count").notNull().default(0),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

/**
 * Durable store for GitHub pull requests associated with Risoluto attempts.
 * Polled by `PrMonitorService` to detect merged / closed state changes.
 */
export const pullRequests = sqliteTable("pull_requests", {
  prId: text("pr_id").primaryKey(),
  attemptId: text("attempt_id"),
  issueId: text("issue_id").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  pullNumber: integer("pull_number").notNull(),
  url: text("url").notNull().unique(),
  branchName: text("branch_name").notNull(),
  status: text("status").notNull().default("open"), // "open" | "merged" | "closed"
  mergedAt: text("merged_at"),
  mergeCommitSha: text("merge_commit_sha"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Durable notification timeline. Each row represents one operator-facing
 * notification event with read state and optional delivery summary.
 */
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  severity: text("severity", {
    enum: ["info", "warning", "critical"],
  }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  source: text("source"),
  href: text("href"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  dedupeKey: text("dedupe_key"),
  metadata: text("metadata"),
  deliverySummary: text("delivery_summary"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Durable automation run history for scheduled and manual automation
 * executions. Stores the mode, outcome, optional tracker issue linkage,
 * and any generated report/findings payload.
 */
export const automationRuns = sqliteTable("automation_runs", {
  id: text("id").primaryKey(),
  automationName: text("automation_name").notNull(),
  mode: text("mode", {
    enum: ["implement", "report", "findings"],
  }).notNull(),
  trigger: text("trigger", {
    enum: ["schedule", "manual"],
  }).notNull(),
  repoUrl: text("repo_url"),
  status: text("status", {
    enum: ["running", "completed", "failed", "skipped"],
  }).notNull(),
  output: text("output"),
  details: text("details"),
  issueId: text("issue_id"),
  issueIdentifier: text("issue_identifier"),
  issueUrl: text("issue_url"),
  error: text("error"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

/**
 * Durable alert firing history including cooldown suppressions and delivery
 * outcomes for each evaluated rule.
 */
export const alertHistory = sqliteTable("alert_history", {
  id: text("id").primaryKey(),
  ruleName: text("rule_name").notNull(),
  eventType: text("event_type").notNull(),
  severity: text("severity", {
    enum: ["info", "warning", "critical"],
  }).notNull(),
  status: text("status", {
    enum: ["delivered", "suppressed", "partial_failure", "failed"],
  }).notNull(),
  channels: text("channels").notNull(),
  deliveredChannels: text("delivered_channels").notNull(),
  failedChannels: text("failed_channels").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const webhookInbox = sqliteTable("webhook_inbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryId: text("delivery_id").notNull().unique(),
  receivedAt: text("received_at").notNull(),
  type: text("type").notNull(),
  action: text("action").notNull(),
  entityId: text("entity_id"),
  issueId: text("issue_id"),
  issueIdentifier: text("issue_identifier"),
  webhookTimestamp: integer("webhook_timestamp"),
  payloadJson: text("payload_json"),
  status: text("status", {
    enum: ["received", "processing", "applied", "ignored", "retry", "dead_letter"],
  })
    .notNull()
    .default("received"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: text("next_attempt_at"),
  lastError: text("last_error"),
  appliedAt: text("applied_at"),
});
