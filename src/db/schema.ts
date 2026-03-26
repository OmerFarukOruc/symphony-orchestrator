import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { AttemptEvent, AttemptRecord } from "@symphony/shared";

export const attempts = sqliteTable(
  "attempts",
  {
    attemptId: text("attempt_id").primaryKey(),
    issueId: text("issue_id").notNull(),
    issueIdentifier: text("issue_identifier").notNull(),
    title: text("title").notNull(),
    workspaceKey: text("workspace_key"),
    workspacePath: text("workspace_path"),
    status: text("status").$type<AttemptRecord["status"]>().notNull(),
    attemptNumber: integer("attempt_number"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    model: text("model").notNull(),
    reasoningEffort: text("reasoning_effort").$type<AttemptRecord["reasoningEffort"]>(),
    modelSource: text("model_source").$type<AttemptRecord["modelSource"]>().notNull(),
    threadId: text("thread_id"),
    turnId: text("turn_id"),
    turnCount: integer("turn_count").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    tokenUsageInputTokens: integer("token_usage_input_tokens"),
    tokenUsageOutputTokens: integer("token_usage_output_tokens"),
    tokenUsageTotalTokens: integer("token_usage_total_tokens"),
    pullRequestUrl: text("pull_request_url"),
    stopSignal: text("stop_signal").$type<AttemptRecord["stopSignal"]>(),
  },
  (table) => [
    index("attempts_issue_identifier_idx").on(table.issueIdentifier),
    index("attempts_status_idx").on(table.status),
    index("attempts_started_at_idx").on(table.startedAt),
  ],
);

export const events = sqliteTable(
  "events",
  {
    rowId: integer("row_id").primaryKey({ autoIncrement: true }),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.attemptId, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    at: text("at").notNull(),
    issueId: text("issue_id"),
    issueIdentifier: text("issue_identifier"),
    sessionId: text("session_id"),
    event: text("event").notNull(),
    message: text("message").notNull(),
    content: text("content"),
    metadataJson: text("metadata_json"),
    usageInputTokens: integer("usage_input_tokens"),
    usageOutputTokens: integer("usage_output_tokens"),
    usageTotalTokens: integer("usage_total_tokens"),
    rateLimitsJson: text("rate_limits_json"),
  },
  (table) => [
    uniqueIndex("events_attempt_sequence_idx").on(table.attemptId, table.sequence),
    index("events_attempt_at_idx").on(table.attemptId, table.at),
  ],
);

export const configOverlays = sqliteTable(
  "config_overlays",
  {
    path: text("path").primaryKey(),
    valueJson: text("value_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("config_overlays_updated_at_idx").on(table.updatedAt)],
);

export const secrets = sqliteTable(
  "secrets",
  {
    key: text("key").primaryKey(),
    algorithm: text("algorithm").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    ciphertext: text("ciphertext").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("secrets_updated_at_idx").on(table.updatedAt)],
);

export const secretAuditRows = sqliteTable(
  "secret_audit_rows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: text("at").notNull(),
    operation: text("operation").$type<"set" | "delete">().notNull(),
    key: text("key").notNull(),
  },
  (table) => [index("secret_audit_rows_at_idx").on(table.at)],
);

export type AttemptRow = typeof attempts.$inferSelect;
export type AttemptInsert = typeof attempts.$inferInsert;
export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type ConfigOverlayRow = typeof configOverlays.$inferSelect;
export type SecretRow = typeof secrets.$inferSelect;
export type SecretAuditRow = typeof secretAuditRows.$inferSelect;

export type SqliteAttemptEventType = AttemptEvent["event"];
