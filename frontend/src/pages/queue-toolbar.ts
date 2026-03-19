import type { WorkflowColumn } from "../types";
import type { QueueFilters } from "./queue-state";

function chip(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-chip";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

interface QueueToolbarOptions {
  toolbar: HTMLElement;
  filters: QueueFilters;
  columns: WorkflowColumn[];
  onRefresh: () => void;
  onChange: () => void;
}

export function buildQueueToolbar(options: QueueToolbarOptions): {
  search: HTMLInputElement;
  sort: HTMLSelectElement;
  firstStageChip: () => HTMLButtonElement | null;
  refreshLabels: () => void;
} {
  const { toolbar, filters, columns, onRefresh, onChange } = options;
  toolbar.innerHTML = "";
  const search = Object.assign(document.createElement("input"), {
    className: "mc-input",
    placeholder: "Search title or identifier",
  });
  search.value = filters.search;
  const sort = document.createElement("select");
  sort.className = "mc-select";
  ["updated", "priority", "tokens"].forEach((value) => {
    const option = Object.assign(document.createElement("option"), { value, textContent: `Sort: ${value}` });
    option.selected = filters.sort === value;
    sort.append(option);
  });
  const stageBar = document.createElement("div");
  stageBar.className = "mc-toolbar-group";
  const priorityBar = document.createElement("div");
  priorityBar.className = "mc-toolbar-group";
  const density = chip(filters.density === "comfortable" ? "Comfortable" : "Compact", () => {
    filters.density = filters.density === "comfortable" ? "compact" : "comfortable";
    syncControls();
  });
  const completed = chip(filters.showCompleted ? "Show completed" : "Hide completed", () => {
    filters.showCompleted = !filters.showCompleted;
    syncControls();
  });
  const refreshButton = chip("Refresh", onRefresh);

  function renderStages(): void {
    stageBar.replaceChildren(
      ...columns.map((column) => {
        const button = chip(`${column.label} ${column.count}`, () => {
          if (filters.stages.has(column.key)) filters.stages.delete(column.key);
          else filters.stages.add(column.key);
          renderStages();
          onChange();
        });
        button.classList.toggle("is-active", filters.stages.has(column.key));
        return button;
      }),
    );
  }

  function renderPriorities(): void {
    priorityBar.replaceChildren(
      ...["all", "urgent", "high", "medium", "low"].map((value) => {
        const button = chip(value, () => {
          filters.priority = value;
          renderPriorities();
          onChange();
        });
        button.classList.toggle("is-active", filters.priority === value);
        return button;
      }),
    );
  }

  function syncControls(): void {
    density.textContent = filters.density === "comfortable" ? "Comfortable" : "Compact";
    completed.textContent = filters.showCompleted ? "Show completed" : "Hide completed";
    onChange();
  }

  search.addEventListener("input", () => {
    filters.search = search.value;
    onChange();
  });
  sort.addEventListener("change", () => {
    filters.sort = sort.value;
    onChange();
  });
  renderStages();
  renderPriorities();
  toolbar.append(search, stageBar, priorityBar, density, sort, completed, refreshButton);
  return {
    search,
    sort,
    firstStageChip: () => stageBar.querySelector<HTMLButtonElement>(".mc-chip"),
    refreshLabels: syncControls,
  };
}
