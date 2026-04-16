import type { RecentEvent, RuntimeIssueView } from "../types/runtime.js";
import { buildLifecycleSteps, shouldCollapseLifecycle } from "../utils/lifecycle-stepper";
import { formatElapsedCompact, formatShortTime } from "../utils/format";

export interface LifecycleSyncState {
  previousSignature: string;
}

export function createLifecycleSyncState(): LifecycleSyncState {
  return { previousSignature: "" };
}

function renderCollapsedContent(
  steps: ReturnType<typeof buildLifecycleSteps>,
): [summary: HTMLElement, meta: HTMLElement] {
  const current = steps.find((step) => step.status === "current") ?? steps.at(-1);
  const summary = document.createElement("div");
  summary.className = "kanban-card-lifecycle-summary";
  summary.textContent = `${current?.label ?? "Agent working"} · setup complete`;

  const metaText = document.createElement("div");
  metaText.className = "kanban-card-lifecycle-meta";
  metaText.textContent = current?.at ? formatShortTime(current.at) : "Live";

  return [summary, metaText];
}

function renderStepRows(steps: ReturnType<typeof buildLifecycleSteps>): HTMLElement[] {
  return steps.map((step) => {
    const row = document.createElement("div");
    row.className = `kanban-card-lifecycle-step is-${step.status}`;

    const dot = document.createElement("span");
    dot.className = "kanban-card-lifecycle-dot";

    const label = document.createElement("span");
    label.className = "kanban-card-lifecycle-label";
    label.textContent = step.label;

    const metaText = document.createElement("span");
    metaText.className = "kanban-card-lifecycle-meta";
    const parts = [step.at ? formatShortTime(step.at) : "", formatElapsedCompact(step.elapsedSeconds)].filter(Boolean);
    metaText.textContent = parts.join(" · ") || (step.status === "pending" ? "Pending" : "");

    row.append(dot, label, metaText);
    return row;
  });
}

export function syncLifecycleElement(
  element: HTMLElement,
  state: LifecycleSyncState,
  issue: RuntimeIssueView,
  recentEvents: RecentEvent[],
): void {
  const shouldShow = issue.status === "queued" || issue.status === "running" || issue.status === "claimed";
  if (!shouldShow) {
    if (!element.hidden) {
      element.hidden = true;
      element.replaceChildren();
      state.previousSignature = "";
    }
    return;
  }

  const lastEventAt = recentEvents.at(-1)?.at ?? "";
  const sig = `${issue.identifier}|${issue.status}|${recentEvents.length}|${lastEventAt}`;
  if (sig === state.previousSignature) {
    element.hidden = false;
    return;
  }
  state.previousSignature = sig;
  element.hidden = false;

  const steps = buildLifecycleSteps(issue, recentEvents);
  const collapsed = shouldCollapseLifecycle(issue, steps);
  element.classList.toggle("is-collapsed", collapsed);

  if (collapsed) {
    const [summary, meta] = renderCollapsedContent(steps);
    element.replaceChildren(summary, meta);
    return;
  }

  element.replaceChildren(...renderStepRows(steps));
}
