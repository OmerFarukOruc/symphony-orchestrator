import type { PlannedIssue } from "../types";
import { createButton, createField } from "../components/forms";

interface PlannerCardOptions {
  issue: PlannedIssue;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: PlannedIssue) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

export function createPlannerCard(options: PlannerCardOptions): HTMLElement {
  const { issue, index, total, selected, onSelect, onChange, onMove, onRemove } = options;
  const card = document.createElement("article");
  card.className = "planner-card mc-panel";
  card.tabIndex = 0;
  card.classList.toggle("is-selected", selected);

  const header = document.createElement("div");
  header.className = "planner-card-header";
  const title = document.createElement("div");
  title.className = "planner-card-titlebar";
  const idBadge = document.createElement("span");
  idBadge.className = "mc-badge";
  idBadge.textContent = issue.id;
  const priorityBadge = document.createElement("span");
  priorityBadge.className = `priority-badge priority-${issue.priority}`;
  priorityBadge.textContent = issue.priority;
  title.append(idBadge, priorityBadge);
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  const up = createButton("↑");
  const down = createButton("↓");
  const remove = createButton("Remove");
  up.disabled = index === 0;
  down.disabled = index === total - 1;
  up.addEventListener("click", () => onMove(-1));
  down.addEventListener("click", () => onMove(1));
  remove.addEventListener("click", onRemove);
  actions.append(up, down, remove);
  header.append(title, actions);

  const titleInput = Object.assign(document.createElement("input"), { className: "mc-input", value: issue.title });
  titleInput.addEventListener("input", () => onChange({ ...issue, title: titleInput.value }));

  const summaryInput = Object.assign(document.createElement("textarea"), {
    className: "mc-textarea",
    value: issue.summary,
  });
  summaryInput.addEventListener("input", () => onChange({ ...issue, summary: summaryInput.value }));

  const priority = document.createElement("select");
  priority.className = "mc-select";
  ["low", "medium", "high"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    priority.append(option);
  });
  priority.value = issue.priority;
  priority.addEventListener("change", () =>
    onChange({ ...issue, priority: priority.value as PlannedIssue["priority"] }),
  );

  const depsInput = Object.assign(document.createElement("input"), {
    className: "mc-input text-mono",
    value: issue.dependencies.join(", "),
    placeholder: "PLAN-1, PLAN-2",
  });
  depsInput.addEventListener("input", () => {
    const dependencies = depsInput.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    onChange({ ...issue, dependencies });
  });

  const criteria = Object.assign(document.createElement("textarea"), {
    className: "mc-textarea planner-card-criteria",
    value: issue.acceptanceCriteria.join("\n"),
  });
  criteria.addEventListener("input", () => {
    const acceptanceCriteria = criteria.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    onChange({ ...issue, acceptanceCriteria });
  });

  const labels = document.createElement("div");
  labels.className = "planner-card-labels";
  issue.labels.forEach((label) => {
    const chip = document.createElement("span");
    chip.className = "mc-chip";
    chip.textContent = label;
    labels.append(chip);
  });

  card.append(
    header,
    createField({ label: "Title" }, titleInput),
    createField({ label: "Summary" }, summaryInput),
    createField({ label: "Priority" }, priority),
    createField({ label: "Dependencies", hint: "Comma-separated issue IDs in execution order." }, depsInput),
    createField({ label: "Acceptance criteria", hint: "One criterion per line." }, criteria),
    labels,
  );

  card.addEventListener("click", onSelect);
  card.addEventListener("focus", onSelect);
  return card;
}
