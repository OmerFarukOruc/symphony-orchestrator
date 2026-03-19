import type { Request, Response } from "express";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import type { RuntimeIssueView, RuntimeSnapshot } from "../core/types.js";

interface RunEntry {
  issue: string;
  attempt: number;
  status: string;
  duration: string;
  model: string;
  tokens: number;
  started: string;
}

function collectIssuesFromSnapshot(snapshot: RuntimeSnapshot): RuntimeIssueView[] {
  const seen = new Set<string>();
  const result: RuntimeIssueView[] = [];

  const addUnique = (issues: RuntimeIssueView[] | undefined): void => {
    if (!issues) return;
    for (const issue of issues) {
      if (!seen.has(issue.identifier)) {
        seen.add(issue.identifier);
        result.push(issue);
      }
    }
  };

  addUnique(snapshot.running);
  addUnique(snapshot.retrying);
  addUnique(snapshot.queued);
  addUnique(snapshot.completed);

  for (const column of snapshot.workflowColumns ?? []) {
    addUnique(column.issues);
  }

  return result;
}

export function handleGlobalRuns(orchestrator: Orchestrator, _req: Request, res: Response): void {
  const snapshot = orchestrator.getSnapshot();
  const allIssues = collectIssuesFromSnapshot(snapshot);
  const runs: RunEntry[] = [];

  for (const issueView of allIssues) {
    if (issueView.attempt !== null && issueView.attempt !== undefined) {
      runs.push({
        issue: issueView.identifier,
        attempt: issueView.attempt,
        status: issueView.status,
        duration: issueView.startedAt
          ? `${Math.round((Date.now() - new Date(issueView.startedAt).getTime()) / 1000)}s`
          : "-",
        model: issueView.model ?? "default",
        tokens: issueView.tokenUsage?.totalTokens ?? 0,
        started: issueView.startedAt ?? "",
      });
    }
  }

  res.json({ runs });
}
