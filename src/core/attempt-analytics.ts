import type { AttemptRecord } from "./types.js";

/** Sort attempts newest-first by `startedAt`, then `attemptNumber` desc, then `attemptId` desc. */
export function sortAttemptsDesc(left: AttemptRecord, right: AttemptRecord): number {
  const byTime = right.startedAt.localeCompare(left.startedAt);
  if (byTime !== 0) return byTime;
  const byNumber = (right.attemptNumber ?? 0) - (left.attemptNumber ?? 0);
  if (byNumber !== 0) return byNumber;
  return right.attemptId.localeCompare(left.attemptId);
}

/** Sum elapsed seconds for all completed attempts. */
export function sumAttemptDurationSeconds(attempts: Iterable<AttemptRecord>): number {
  let total = 0;
  for (const attempt of attempts) {
    if (!attempt.endedAt) continue;
    const startedAt = Date.parse(attempt.startedAt);
    const endedAt = Date.parse(attempt.endedAt);
    if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) continue;
    total += Math.max(0, endedAt - startedAt) / 1000;
  }
  return total;
}
