import { createEmptyState } from "../components/empty-state";
import type { PlannerState } from "./planner-state";
import { planSummary } from "./planner-helpers";

export function renderPlannerRail(
  rail: HTMLElement,
  state: PlannerState,
  onSelectIssue: (issueId: string) => void,
): void {
  rail.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "planner-rail-section";
  heading.innerHTML = `<h2>Summary</h2><p class="text-secondary">Dependencies, labels, and execution intent stay visible while editing.</p>`;
  rail.append(heading);

  if (!state.plan?.length) {
    rail.append(
      createEmptyState(
        "No plan yet",
        "Start with a concrete goal: outcome, constraints, and how many issues you expect.",
      ),
    );
    return;
  }

  const summary = planSummary(state.plan);
  const stats = document.createElement("div");
  stats.className = "planner-summary-grid";
  stats.innerHTML = `<div class="planner-summary-card"><strong>${summary.count}</strong><span>Issues</span></div><div class="planner-summary-card"><strong>${summary.deps}</strong><span>Dependencies</span></div><div class="planner-summary-card"><strong>${summary.high}</strong><span>High priority</span></div>`;
  const deps = document.createElement("div");
  deps.className = "planner-dependency-strip";
  state.plan.forEach((issue) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "planner-dependency-chip";
    chip.textContent = issue.dependencies.length
      ? `${issue.id} ← ${issue.dependencies.join(", ")}`
      : `${issue.id} starts chain`;
    chip.addEventListener("click", () => onSelectIssue(issue.id));
    deps.append(chip);
  });
  rail.append(stats, deps);

  if (!state.result?.created.length) {
    return;
  }

  const result = document.createElement("div");
  result.className = "planner-result-links";
  result.innerHTML = `<h2>Created</h2>`;
  state.result.created.forEach((item) => {
    const link = document.createElement("a");
    link.className = "planner-result-link";
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = item.identifier;
    result.append(link);
  });
  rail.append(result);
}
