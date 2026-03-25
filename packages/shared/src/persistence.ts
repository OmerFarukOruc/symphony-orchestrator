import type { AttemptEvent, AttemptRecord } from "../../../src/core/types.js";

/**
 * Attempt persistence interface.
 *
 * The concrete implementation in `src/core/attempt-store.ts` already
 * satisfies this shape; extracting it lets consumers depend on the
 * interface without pulling in SQLite or filesystem dependencies.
 */
export interface AttemptStoreInterface {
  getAttempt(attemptId: string): AttemptRecord | null;
  getAllAttempts(): AttemptRecord[];
  getEvents(attemptId: string): AttemptEvent[];
  getAttemptsForIssue(issueIdentifier: string): AttemptRecord[];
  createAttempt(attempt: AttemptRecord): Promise<void>;
  updateAttempt(attemptId: string, patch: Partial<AttemptRecord>): Promise<void>;
  appendEvent(event: AttemptEvent): Promise<void>;
}
