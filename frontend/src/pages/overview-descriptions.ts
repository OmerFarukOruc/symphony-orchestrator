import type { AppState } from "../state/store";

/**
 * Describes the current orchestrator moment in human-readable terms.
 * Pure function — takes snapshot data, returns state/detail strings.
 */
export function describeCurrentMoment(
  snapshot: NonNullable<AppState["snapshot"]>,
  attentionCount: number,
): {
  state: string;
  detail: string;
} {
  const queued = (snapshot.queued ?? []).length;
  const running = snapshot.counts.running;
  const completed = (snapshot.completed ?? []).length;

  if (attentionCount > 0) {
    return {
      state: attentionCount === 1 ? "1 issue needs review" : `${attentionCount} issues need review`,
      detail:
        "Start in the review lane first. Blocked, retrying, and decision-ready work is grouped there before everything else.",
    };
  }

  if (running > 0) {
    return {
      state: running === 1 ? "1 issue is running" : `${running} issues are running`,
      detail:
        queued > 0
          ? `${queued} more ${queued === 1 ? "issue is" : "issues are"} queued behind the active work.`
          : "Active work is progressing cleanly and nothing needs review right now.",
    };
  }

  if (queued > 0) {
    return {
      state: queued === 1 ? "1 issue is queued" : `${queued} issues are queued`,
      detail: "The queue is ready and waiting for the next poll cycle to pick it up.",
    };
  }

  if (completed > 0) {
    return {
      state: "Queue is clear",
      detail: "Everything is handled. Scan finished runs and recent activity below if you want the latest context.",
    };
  }

  return {
    state: "Ready for the first issue",
    detail: "Create an issue in Linear and move it to In Progress \u2014 Risoluto will take it from there.",
  };
}

/**
 * Returns a human-readable description of the current attention zone state.
 * Pure function — takes a count, returns a string.
 */
export function describeAttentionZone(attentionCount: number): string {
  if (attentionCount === 0) {
    return "Nothing needs review right now. If a run stalls, retries, or needs your decision, it will appear here first.";
  }

  if (attentionCount === 1) {
    return "One issue is waiting on a retry, unblock, or decision. Review it here before you scan the rest of the system.";
  }

  return `${attentionCount} issues are waiting on retries, unblocks, or decisions. Start with the oldest blocked item and work downward.`;
}
