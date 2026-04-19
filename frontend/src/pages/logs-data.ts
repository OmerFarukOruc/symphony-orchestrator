import { api } from "../api";
import type { AttemptRecord, IssueDetail, RecentEvent, RuntimeIssueView } from "../types";

export interface LogsData {
  title: string;
  issueId: string;
  events: RecentEvent[];
  issueView: RuntimeIssueView | null;
}

export function shouldDisplayLogsEvent(event: RecentEvent): boolean {
  // Legacy stream deltas without accumulated content are transport noise. The
  // reducer surfaces agent_message_partial and tool_output_live events that
  // carry accumulated content, so raw "Agent streaming text" stubs stay hidden.
  if (event.event === "agent_streaming") {
    return false;
  }
  if (event.message === "Agent streaming text" && !event.content) {
    return false;
  }
  return true;
}

function filterLogsEvents(events: RecentEvent[]): RecentEvent[] {
  return events.filter((event) => shouldDisplayLogsEvent(event));
}

export async function loadLiveLogs(issueId: string): Promise<LogsData> {
  const detail: IssueDetail = await api.getIssue(issueId);
  return {
    title: detail.title,
    issueId: detail.identifier,
    events: filterLogsEvents(detail.recentEvents),
    issueView: detail,
  };
}

export async function loadArchiveLogs(issueId: string): Promise<LogsData> {
  const attempts = await api.getAttempts(issueId);

  // Sort by attemptNumber descending. Null attemptNumber means "current/most recent",
  // so treat null as Infinity to prioritize it over numbered historical attempts.
  const latestAttempt = [...attempts.attempts].sort((left, right) => {
    const leftNum = left.attemptNumber ?? Infinity;
    const rightNum = right.attemptNumber ?? Infinity;
    return rightNum - leftNum;
  })[0];
  if (!latestAttempt) {
    return { title: issueId, issueId, events: [], issueView: null };
  }
  const detail: AttemptRecord = await api.getAttemptDetail(latestAttempt.attemptId);
  return {
    title: detail.title ?? detail.issueIdentifier ?? "Archived attempt",
    issueId: detail.issueIdentifier ?? issueId,
    events: filterLogsEvents(detail.events ?? []),
    issueView: null,
  };
}
