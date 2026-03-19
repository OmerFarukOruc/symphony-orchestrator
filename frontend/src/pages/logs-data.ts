import { api } from "../api";
import type { AttemptRecord, IssueDetail, RecentEvent } from "../types";

export interface LogsData {
  title: string;
  issueId: string;
  events: RecentEvent[];
}

export async function loadLiveLogs(issueId: string): Promise<LogsData> {
  const detail: IssueDetail = await api.getIssue(issueId);
  return { title: detail.title, issueId: detail.identifier, events: detail.recentEvents };
}

export async function loadArchiveLogs(issueId: string): Promise<LogsData> {
  const attempts = await api.getAttempts(issueId);
  const latestAttempt = [...attempts.attempts].sort((left, right) => right.attemptNumber - left.attemptNumber)[0];
  if (!latestAttempt) {
    return { title: issueId, issueId, events: [] };
  }
  const detail: AttemptRecord = await api.getAttemptDetail(latestAttempt.attemptId);
  return {
    title: detail.title ?? detail.issueIdentifier ?? "Archived attempt",
    issueId: detail.issueIdentifier ?? issueId,
    events: detail.events ?? [],
  };
}
