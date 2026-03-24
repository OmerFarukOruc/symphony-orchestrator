import type { RecentEvent, RuntimeIssueView } from "../types";

export interface LifecycleStepView {
  key: string;
  label: string;
  status: "complete" | "current" | "pending" | "failed";
  at: string | null;
  elapsedSeconds: number | null;
}

const STEP_LABELS = ["Queued", "Workspace ready", "Container running", "Codex initializing", "Agent working"] as const;
const LIFECYCLE_EVENT_TYPES = new Set([
  "issue_queued",
  "workspace_preparing",
  "workspace_ready",
  "workspace_failed",
  "container_starting",
  "container_running",
  "container_failed",
  "codex_initializing",
  "codex_failed",
  "auth_failed",
  "thread_started",
]);

type StageSnapshot = {
  activeStepIndex: number;
  failed: boolean;
  stageTimes: Array<string | null>;
};

function emptyStageTimes(): Array<string | null> {
  return Array.from({ length: STEP_LABELS.length }, () => null);
}

function applyEvent(event: RecentEvent, snapshot: StageSnapshot): void {
  switch (event.event) {
    case "issue_queued":
      snapshot.activeStepIndex = 0;
      snapshot.stageTimes[0] = event.at;
      return;
    case "workspace_preparing":
      snapshot.activeStepIndex = 1;
      snapshot.stageTimes[1] = snapshot.stageTimes[1] ?? event.at;
      return;
    case "workspace_ready":
      snapshot.activeStepIndex = 2;
      snapshot.stageTimes[1] = event.at;
      return;
    case "container_starting":
      snapshot.activeStepIndex = 2;
      snapshot.stageTimes[2] = snapshot.stageTimes[2] ?? event.at;
      return;
    case "container_running":
      snapshot.activeStepIndex = 3;
      snapshot.stageTimes[2] = event.at;
      return;
    case "codex_initializing":
      snapshot.activeStepIndex = 3;
      snapshot.stageTimes[3] = event.at;
      return;
    case "thread_started":
    case "turn_started":
    case "agent_started":
    case "step_started":
      snapshot.activeStepIndex = 4;
      snapshot.stageTimes[4] = event.at;
      return;
    case "workspace_failed":
      snapshot.activeStepIndex = 1;
      snapshot.failed = true;
      snapshot.stageTimes[1] = event.at;
      return;
    case "container_failed":
      snapshot.activeStepIndex = 2;
      snapshot.failed = true;
      snapshot.stageTimes[2] = event.at;
      return;
    case "auth_failed":
    case "codex_failed":
      snapshot.activeStepIndex = 3;
      snapshot.failed = true;
      snapshot.stageTimes[3] = event.at;
      return;
    default:
      return;
  }
}

function isLifecycleEvent(event: RecentEvent): boolean {
  return LIFECYCLE_EVENT_TYPES.has(event.event);
}

function latestLifecycleWindow(events: RecentEvent[]): RecentEvent[] {
  const lifecycleEvents = events.filter(isLifecycleEvent);
  if (lifecycleEvents.length === 0) {
    return [];
  }

  for (let index = lifecycleEvents.length - 1; index >= 0; index -= 1) {
    if (lifecycleEvents[index].event === "issue_queued") {
      return lifecycleEvents.slice(index);
    }
  }

  return [];
}

function synthesizeFromIssue(issue: RuntimeIssueView): StageSnapshot | null {
  const stageTimes = emptyStageTimes();
  const at = issue.lastEventAt ?? issue.updatedAt ?? null;

  if (issue.status === "queued" || issue.status === "claimed") {
    stageTimes[0] = at;
    return { activeStepIndex: 0, failed: false, stageTimes };
  }

  if (issue.status === "running") {
    stageTimes[4] = at;
    return { activeStepIndex: 4, failed: false, stageTimes };
  }

  return null;
}

function buildElapsedSeconds(stageTimes: Array<string | null>, index: number): number | null {
  const at = stageTimes[index];
  if (!at) {
    return null;
  }

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previousAt = stageTimes[previousIndex];
    if (!previousAt) {
      continue;
    }
    const diffMs = Date.parse(at) - Date.parse(previousAt);
    if (!Number.isNaN(diffMs) && diffMs >= 0) {
      return Math.round(diffMs / 1000);
    }
    break;
  }

  return null;
}

export function buildLifecycleSteps(issue: RuntimeIssueView, recentEvents: RecentEvent[]): LifecycleStepView[] {
  const issueEvents = recentEvents
    .filter((event) => event.issue_identifier === issue.identifier)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const relevantEvents = latestLifecycleWindow(issueEvents);

  const snapshot: StageSnapshot =
    relevantEvents.length > 0
      ? { activeStepIndex: 0, failed: false, stageTimes: emptyStageTimes() }
      : (synthesizeFromIssue(issue) ?? { activeStepIndex: 0, failed: false, stageTimes: emptyStageTimes() });

  for (const event of relevantEvents) {
    applyEvent(event, snapshot);
  }

  if (!snapshot.failed && issue.status === "running") {
    snapshot.activeStepIndex = 4;
    snapshot.stageTimes[4] = snapshot.stageTimes[4] ?? issue.lastEventAt ?? issue.updatedAt;
  }

  return STEP_LABELS.map((label, index) => {
    let status: LifecycleStepView["status"] = "pending";
    if (snapshot.failed && index === snapshot.activeStepIndex) {
      status = "failed";
    } else if (index < snapshot.activeStepIndex) {
      status = "complete";
    } else if (index === snapshot.activeStepIndex) {
      status = "current";
    }

    return {
      key: label.toLowerCase().replaceAll(" ", "_"),
      label,
      status,
      at: snapshot.stageTimes[index],
      elapsedSeconds: buildElapsedSeconds(snapshot.stageTimes, index),
    };
  });
}

export function shouldCollapseLifecycle(issue: RuntimeIssueView, steps: LifecycleStepView[]): boolean {
  return issue.status === "running" && steps.some((step) => step.key === "agent_working" && step.status === "current");
}
