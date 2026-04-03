/**
 * Port interface for attempt storage.
 *
 * Both the JSONL-based `AttemptStore` and the SQLite-backed
 * `SqliteAttemptStore` implement this contract. Consumers should
 * depend on this interface rather than a concrete implementation.
 */

import type { AttemptCheckpointRecord, AttemptEvent, AttemptRecord, PrRecord } from "./types.js";

/** PR data used when upserting a PR for monitoring. */
export interface UpsertPrInput extends Omit<PrRecord, "prId" | "mergedAt" | "mergeCommitSha"> {
  branchName: string;
}

/** Extended PR record as returned by `getOpenPrs()`. */
export type OpenPrRecord = PrRecord & { branchName: string };

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
  sumCostUsd(): number;
  sumArchivedTokens(): { inputTokens: number; outputTokens: number; totalTokens: number };
  appendCheckpoint(checkpoint: Omit<AttemptCheckpointRecord, "checkpointId" | "ordinal">): Promise<void>;
  listCheckpoints(attemptId: string): Promise<AttemptCheckpointRecord[]>;

  /** Insert or update a PR row keyed by URL. */
  upsertPr(pr: UpsertPrInput): Promise<void>;
  /** Return all PRs with status = "open". */
  getOpenPrs(): Promise<OpenPrRecord[]>;
  /** Return all tracked PRs regardless of status. */
  getAllPrs(): Promise<OpenPrRecord[]>;
  /** Transition a PR to merged or closed. */
  updatePrStatus(url: string, status: "merged" | "closed", mergedAt?: string, mergeCommitSha?: string): Promise<void>;
}

/** Sort attempts newest-first by `startedAt`, then `attemptNumber` desc, then `attemptId` desc. */
export function sortAttemptsDesc(left: AttemptRecord, right: AttemptRecord): number {
  const byTime = right.startedAt.localeCompare(left.startedAt);
  if (byTime !== 0) return byTime;
  const byNumber = (right.attemptNumber ?? 0) - (left.attemptNumber ?? 0);
  if (byNumber !== 0) return byNumber;
  return right.attemptId.localeCompare(left.attemptId);
}

/** Sum elapsed seconds for all completed attempts. Shared by JSONL and SQLite store test helpers. */
export function sumAttemptDurationSeconds(attempts: Iterable<AttemptRecord>): number {
  let total = 0;
  for (const attempt of attempts) {
    if (!attempt.endedAt) continue;
    const startedAt = Date.parse(attempt.startedAt);
    const endedAt = Date.parse(attempt.endedAt);
    if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) continue;
    total += (endedAt - startedAt) / 1000;
  }
  return total;
}
