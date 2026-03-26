/**
 * Port interface for attempt storage.
 *
 * Both the JSONL-based `AttemptStore` and the SQLite-backed
 * `SqliteAttemptStore` implement this contract. Consumers should
 * depend on this interface rather than a concrete implementation.
 */

import type { AttemptEvent, AttemptRecord } from "./types.js";

export interface AttemptStorePort {
  start(): Promise<void>;
  getAttempt(attemptId: string): AttemptRecord | null;
  getAllAttempts(): AttemptRecord[];
  getEvents(attemptId: string): AttemptEvent[];
  getAttemptsForIssue(issueIdentifier: string): AttemptRecord[];
  createAttempt(attempt: AttemptRecord): Promise<void>;
  updateAttempt(attemptId: string, patch: Partial<AttemptRecord>): Promise<void>;
  appendEvent(event: AttemptEvent): Promise<void>;
  sumArchivedSeconds(): number;
}

/** Sort attempts newest-first by `startedAt`. Shared by both store implementations. */
export function sortAttemptsDesc(left: AttemptRecord, right: AttemptRecord): number {
  return right.startedAt.localeCompare(left.startedAt);
}
