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
