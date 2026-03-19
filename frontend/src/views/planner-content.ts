import { createEmptyState } from "../components/empty-state";
import { skeletonCard } from "../ui/skeleton";
import { createPlannerCard } from "./planner-cards";
import { clonePlan } from "./planner-state";
import { moveItem, normalizeDependencies } from "./planner-helpers";
import { renderPlannerRail } from "./planner-rail";
import type { PlannerState } from "./planner-state";

interface PlannerContentOptions {
  main: HTMLElement;
  rail: HTMLElement;
  state: PlannerState;
  form: HTMLElement;
  generating: boolean;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onRender: () => void;
}

export function renderPlannerContent(options: PlannerContentOptions): void {
  const { main, rail, state, form, generating, selectedIndex, onSelectIndex, onRender } = options;
  main.replaceChildren(form);

  const selectIssue = (issueId: string): void => {
    onSelectIndex(state.plan?.findIndex((issue) => issue.id === issueId) ?? 0);
    onRender();
  };

  if (generating) {
    const loading = document.createElement("div");
    loading.className = "planner-cards";
    loading.append(skeletonCard(), skeletonCard(), skeletonCard());
    main.append(loading);
    renderPlannerRail(rail, state, selectIssue);
    return;
  }

  if (!state.plan?.length) {
    main.append(
      createEmptyState(
        "Generate an implementation plan",
        "Good prompts mention the end state, constraints, and whether you want atomic issues or broader slices.",
      ),
    );
    renderPlannerRail(rail, state, selectIssue);
    return;
  }

  const cards = document.createElement("div");
  cards.className = "planner-cards";
  state.plan.forEach((issue, index) => {
    cards.append(
      createPlannerCard({
        issue,
        index,
        total: state.plan?.length ?? 0,
        selected: selectedIndex === index,
        onSelect: () => {
          onSelectIndex(index);
          onRender();
        },
        onChange: (next) => {
          if (!state.plan) return;
          state.plan[index] = next;
          state.plan = normalizeDependencies(clonePlan(state.plan) ?? []);
          onRender();
        },
        onMove: (direction) => {
          if (!state.plan) return;
          state.plan = moveItem(state.plan, index, index + direction);
          onSelectIndex(Math.max(0, Math.min((state.plan.length ?? 1) - 1, index + direction)));
          onRender();
        },
        onRemove: () => {
          if (!state.plan) return;
          state.plan.splice(index, 1);
          state.plan = normalizeDependencies(clonePlan(state.plan) ?? []);
          onSelectIndex(Math.max(0, selectedIndex - (selectedIndex >= index ? 1 : 0)));
          onRender();
        },
      }),
    );
  });
  main.append(cards);

  if (state.step === "result" && state.result?.created.length) {
    const result = document.createElement("section");
    result.className = "mc-panel planner-result-panel";
    result.innerHTML = `<h2>Result</h2><p class="text-secondary">Linear created these issues. Keep editing if you want to regenerate a better follow-up batch.</p>`;
    state.result.created.forEach((item) => {
      const link = document.createElement("a");
      link.className = "planner-result-link";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = item.identifier;
      result.append(link);
    });
    main.append(result);
  }

  renderPlannerRail(rail, state, selectIssue);
}
