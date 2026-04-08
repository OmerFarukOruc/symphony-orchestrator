import { api } from "../api";
import type { AttemptRecord, IssueDetail, RecentEvent } from "../types";

export interface LogsData {
  title: string;
  issueId: string;
  events: RecentEvent[];
}

export function shouldDisplayLogsEvent(event: RecentEvent): boolean {
  // Stream deltas are transport noise on the logs page. The final assistant
  // message still appears as its own event, so hiding these avoids duplicate,
  // low-signal rows without losing operator context.
  return event.event !== "agent_streaming" && event.message !== "Agent streaming text";
}

function filterLogsEvents(events: RecentEvent[]): RecentEvent[] {
  return events.filter((event) => shouldDisplayLogsEvent(event));
}

export async function loadLiveLogs(issueId: string): Promise<LogsData> {
  const detail: IssueDetail = await api.getIssue(issueId);
  return { title: detail.title, issueId: detail.identifier, events: filterLogsEvents(detail.recentEvents) };
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
    return { title: issueId, issueId, events: [] };
  }
  const detail: AttemptRecord = await api.getAttemptDetail(latestAttempt.attemptId);
  return {
    title: detail.title ?? detail.issueIdentifier ?? "Archived attempt",
    issueId: detail.issueIdentifier ?? issueId,
    events: filterLogsEvents(detail.events ?? []),
  };
}
