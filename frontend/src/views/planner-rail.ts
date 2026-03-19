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
  const headH2 = document.createElement("h2");
  headH2.textContent = "Summary";
  const headP = document.createElement("p");
  headP.className = "text-secondary";
  headP.textContent = "Dependencies, labels, and execution intent stay visible while editing.";
  heading.append(headH2, headP);
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
  function summaryCard(value: number, label: string): HTMLElement {
    const card = document.createElement("div");
    card.className = "planner-summary-card";
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    return card;
  }
  stats.append(
    summaryCard(summary.count, "Issues"),
    summaryCard(summary.deps, "Dependencies"),
    summaryCard(summary.high, "High priority"),
  );
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
  const resultH2 = document.createElement("h2");
  resultH2.textContent = "Created";
  result.append(resultH2);
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
