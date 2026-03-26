/**
 * Mapping functions between SQLite row shapes and TypeScript domain types.
 *
 * Handles the camelCase ↔ snake_case conversion and the flattening of
 * nested objects (e.g. `tokenUsage`) into individual columns.
 */

import type { AttemptEvent, AttemptRecord, TokenUsageSnapshot } from "../../core/types.js";
import type { attempts, attemptEvents } from "./schema.js";

/** Row shape returned by Drizzle selects on the `attempts` table. */
type AttemptRow = typeof attempts.$inferSelect;

/** Row shape for Drizzle inserts on the `attempts` table. */
type AttemptInsertRow = typeof attempts.$inferInsert;

/** Row shape returned by Drizzle selects on the `attempt_events` table. */
type AttemptEventRow = typeof attemptEvents.$inferSelect;

/** Row shape for Drizzle inserts on the `attempt_events` table. */
type AttemptEventInsertRow = typeof attemptEvents.$inferInsert;

/** Convert a database row to an `AttemptRecord`. */
export function rowToAttemptRecord(row: AttemptRow): AttemptRecord {
  const tokenUsage = buildTokenUsage(row.inputTokens, row.outputTokens, row.totalTokens);
  return {
    attemptId: row.attemptId,
    issueId: row.issueId,
    issueIdentifier: row.issueIdentifier,
    title: row.title,
    workspaceKey: row.workspaceKey ?? null,
    workspacePath: row.workspacePath ?? null,
    status: row.status as AttemptRecord["status"],
    attemptNumber: row.attemptNumber ?? null,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
    model: row.model,
    reasoningEffort: (row.reasoningEffort as AttemptRecord["reasoningEffort"]) ?? null,
    modelSource: row.modelSource as AttemptRecord["modelSource"],
    threadId: row.threadId ?? null,
    turnId: row.turnId ?? null,
    turnCount: row.turnCount,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    tokenUsage,
    pullRequestUrl: row.pullRequestUrl ?? null,
    stopSignal: (row.stopSignal as AttemptRecord["stopSignal"]) ?? null,
  };
}

/** Convert an `AttemptRecord` to a database insert row. */
export function attemptRecordToRow(record: AttemptRecord): AttemptInsertRow {
  return {
    attemptId: record.attemptId,
    issueId: record.issueId,
    issueIdentifier: record.issueIdentifier,
    title: record.title,
    workspaceKey: record.workspaceKey,
    workspacePath: record.workspacePath,
    status: record.status,
    attemptNumber: record.attemptNumber,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    model: record.model,
    reasoningEffort: record.reasoningEffort,
    modelSource: record.modelSource,
    threadId: record.threadId,
    turnId: record.turnId,
    turnCount: record.turnCount,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    inputTokens: record.tokenUsage?.inputTokens ?? null,
    outputTokens: record.tokenUsage?.outputTokens ?? null,
    totalTokens: record.tokenUsage?.totalTokens ?? null,
    pullRequestUrl: record.pullRequestUrl ?? null,
    stopSignal: record.stopSignal ?? null,
  };
}

/** Convert a database row to an `AttemptEvent`. */
export function rowToAttemptEvent(row: AttemptEventRow): AttemptEvent {
  const usage = buildTokenUsage(row.inputTokens, row.outputTokens, row.totalTokens);
  const metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null;
  return {
    attemptId: row.attemptId,
    at: row.timestamp,
    issueId: row.issueId ?? null,
    issueIdentifier: row.issueIdentifier ?? null,
    sessionId: row.sessionId ?? null,
    event: row.type,
    message: row.message,
    content: row.content ?? null,
    usage,
    metadata,
  };
}

/** Convert an `AttemptEvent` to a database insert row. */
export function attemptEventToRow(event: AttemptEvent): AttemptEventInsertRow {
  return {
    attemptId: event.attemptId,
    timestamp: event.at,
    issueId: event.issueId,
    issueIdentifier: event.issueIdentifier,
    sessionId: event.sessionId,
    type: event.event,
    message: event.message,
    content: event.content ?? null,
    inputTokens: event.usage?.inputTokens ?? null,
    outputTokens: event.usage?.outputTokens ?? null,
    totalTokens: event.usage?.totalTokens ?? null,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
  };
}

function buildTokenUsage(
  inputTokens: number | null,
  outputTokens: number | null,
  totalTokens: number | null,
): TokenUsageSnapshot | null {
  if (inputTokens === null && outputTokens === null && totalTokens === null) {
    return null;
  }
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? 0,
  };
}
