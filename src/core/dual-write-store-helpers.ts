import { isDeepStrictEqual } from "node:util";

import type { AttemptEvent, AttemptRecord, SymphonyLogger } from "@symphony/shared";

import { FEATURE_FLAG_SQLITE_READS, isEnabled } from "./feature-flags.js";

type AttemptLikeStore = {
  getAttempt: (attemptId: string) => AttemptRecord | null;
  getAllAttempts: () => AttemptRecord[];
  getEvents: (attemptId: string) => AttemptEvent[];
  getAttemptsForIssue: (issueIdentifier: string) => AttemptRecord[];
};

function isAttemptRecord(value: unknown): value is AttemptRecord {
  return typeof value === "object" && value !== null && "attemptId" in value && "startedAt" in value;
}

function isAttemptEvent(value: unknown): value is AttemptEvent {
  return typeof value === "object" && value !== null && "attemptId" in value && "at" in value && "event" in value;
}

function normalizeAttemptRecord(attempt: AttemptRecord): AttemptRecord {
  return {
    ...attempt,
    pullRequestUrl: attempt.pullRequestUrl ?? null,
    stopSignal: attempt.stopSignal ?? null,
  };
}

function normalizeAttemptEvent(event: AttemptEvent): AttemptEvent {
  return {
    ...event,
    content: event.content ?? null,
    metadata: event.metadata ?? null,
    usage: event.usage ?? null,
    rateLimits: event.rateLimits ?? null,
  };
}

export function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForComparison(entry));
  }
  if (isAttemptRecord(value)) {
    return normalizeAttemptRecord(value);
  }
  if (isAttemptEvent(value)) {
    return normalizeAttemptEvent(value);
  }
  return value;
}

export function readAttemptStoreWithFallback<T>(
  logger: SymphonyLogger,
  operation: string,
  fileStore: AttemptLikeStore,
  sqliteStore: AttemptLikeStore,
  read: (store: AttemptLikeStore) => T,
  isMissing: (value: T) => boolean,
): T {
  if (!isEnabled(FEATURE_FLAG_SQLITE_READS)) {
    return read(fileStore);
  }

  try {
    const sqliteValue = read(sqliteStore);
    if (!isMissing(sqliteValue)) {
      return sqliteValue;
    }

    const fileValue = read(fileStore);
    if (!isMissing(fileValue)) {
      logger.warn(
        {
          operation,
          fileValue: normalizeForComparison(fileValue),
          sqliteValue: normalizeForComparison(sqliteValue),
        },
        "sqlite attempt read missing data; falling back to file store",
      );
      return fileValue;
    }

    return sqliteValue;
  } catch (error) {
    logger.warn({ operation, error: String(error) }, "sqlite attempt read failed; falling back to file store");
    return read(fileStore);
  }
}

export function valuesMatch(fileValue: unknown, sqliteValue: unknown): boolean {
  return isDeepStrictEqual(normalizeForComparison(fileValue), normalizeForComparison(sqliteValue));
}
