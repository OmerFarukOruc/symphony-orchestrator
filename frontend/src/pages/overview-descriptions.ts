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
      state: attentionCount === 1 ? "1 issue needs intervention" : `${attentionCount} issues need intervention`,
      detail: "Blocked, retrying, and waiting work is collected here first so the next decision is always obvious.",
    };
  }

  if (running > 0) {
    return {
      state: running === 1 ? "1 issue is in flight" : `${running} issues are in flight`,
      detail:
        queued > 0
          ? `${queued} more ${queued === 1 ? "issue is" : "issues are"} queued behind the active work.`
          : "Active work is progressing cleanly without intervention right now.",
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
      detail: "Everything is handled. Review the latest outcomes and recent activity below.",
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
    return "Nothing needs your attention right now. When an issue blocks, retries, or needs a decision, it will surface here.";
  }

  if (attentionCount === 1) {
    return "One issue is waiting on a recovery, unblock, or decision. Resolve it here before scanning the rest of the system.";
  }

  return `${attentionCount} issues are competing for attention. Start with the oldest or most blocked item and work downward.`;
}
