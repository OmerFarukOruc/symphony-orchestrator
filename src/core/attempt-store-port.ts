/**
 * Port interface for attempt storage.
 *
 * Consumers should depend on this interface rather than a concrete
 * persistence implementation.
 *
 * The full port is composed from three narrower capability interfaces:
 * - {@link PrStorePort} — PR upsert/query/status operations
 * - {@link AttemptAnalyticsPort} — aggregate cost/duration/token metrics
 * - {@link CheckpointStorePort} — checkpoint append/list operations
 *
 * Consumers that only need a subset of the full contract may depend on
 * one of the sub-ports directly rather than the composed interface.
 */

import type { AttemptCheckpointRecord, AttemptEvent, AttemptRecord, PrRecord } from "./types.js";

/** PR data used when upserting a PR for monitoring. */
export interface UpsertPrInput extends Omit<PrRecord, "prId" | "mergedAt" | "mergeCommitSha"> {
  branchName: string;
}

/** Extended PR record as returned by `getOpenPrs()`. */
export type OpenPrRecord = PrRecord & { branchName: string };

/** Narrow port for PR persistence operations. */
export interface PrStorePort {
  /** Insert or update a PR row keyed by URL. */
  upsertPr(pr: UpsertPrInput): Promise<void>;
  /** Return all PRs with status = "open". */
  getOpenPrs(): Promise<OpenPrRecord[]>;
  /** Return all tracked PRs regardless of status. */
  getAllPrs(): Promise<OpenPrRecord[]>;
  /** Transition a PR to merged or closed. */
  updatePrStatus(url: string, status: "merged" | "closed", mergedAt?: string, mergeCommitSha?: string): Promise<void>;
}

/** Narrow port for aggregate attempt analytics (cost, duration, tokens). */
export interface AttemptAnalyticsPort {
  sumArchivedSeconds(): number;
  sumCostUsd(): number;
  sumArchivedTokens(): { inputTokens: number; outputTokens: number; totalTokens: number };
}

/** Narrow port for attempt checkpoint persistence. */
export interface CheckpointStorePort {
  appendCheckpoint(checkpoint: Omit<AttemptCheckpointRecord, "checkpointId" | "ordinal">): Promise<void>;
  listCheckpoints(attemptId: string): Promise<AttemptCheckpointRecord[]>;
}

/**
 * Full attempt store port.
 *
 * Composes the three narrower sub-ports with the core CRUD methods. Prefer
 * depending on a sub-port when only a subset of capabilities is needed.
 */
export interface AttemptStorePort extends PrStorePort, AttemptAnalyticsPort, CheckpointStorePort {
  start(): Promise<void>;
  getAttempt(attemptId: string): AttemptRecord | null;
  getAllAttempts(): AttemptRecord[];
  getEvents(attemptId: string): AttemptEvent[];
  getAttemptsForIssue(issueIdentifier: string): AttemptRecord[];
  createAttempt(attempt: AttemptRecord): Promise<void>;
  updateAttempt(attemptId: string, patch: Partial<AttemptRecord>): Promise<void>;
  appendEvent(event: AttemptEvent): Promise<void>;
}
