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

/**
 * Normalize stage keys for deduplication.
 * "canceled" and "cancelled" are treated as the same stage.
 */
function normalizeStageKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower === "cancelled" || lower === "canceled") return "cancelled";
  return key.toLowerCase().replaceAll(" ", "_");
}

/**
 * Normalize stage label for display.
 */
function normalizeStageLabel(key: string): string {
  const lower = key.toLowerCase();
  if (lower === "cancelled" || lower === "canceled") return "Canceled";
  return key;
}

/**
 * Merge columns with the same normalized key.
 */
function mergeColumns(columns: WorkflowColumn[]): WorkflowColumn[] {
  const merged = new Map<string, WorkflowColumn>();
  for (const column of columns) {
    const normalized = normalizeStageKey(column.key);
    const existing = merged.get(normalized);
    if (existing) {
      existing.issues = [...existing.issues, ...column.issues];
      existing.count = (existing.count ?? 0) + (column.count ?? 0);
    } else {
      merged.set(normalized, {
        ...column,
        key: normalized,
        label: normalizeStageLabel(column.label),
      });
    }
  }
  return Array.from(merged.values());
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
    placeholder: "Search issues\u2026",
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
  density.classList.toggle("is-active", filters.density === "comfortable");
  const completed = chip(filters.showCompleted ? "Show completed" : "Hide completed", () => {
    filters.showCompleted = !filters.showCompleted;
    syncControls();
  });
  completed.classList.toggle("is-active", filters.showCompleted);
  const refreshButton = chip("Refresh from Linear", onRefresh);

  function renderStages(): void {
    const merged = mergeColumns(columns);
    stageBar.replaceChildren(
      ...merged.map((column) => {
        const label = column.count > 0 ? `${column.label} ${column.count}` : column.label;
        const button = chip(label, () => {
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
    density.classList.toggle("is-active", filters.density === "comfortable");
    completed.textContent = filters.showCompleted ? "Show completed" : "Hide completed";
    completed.classList.toggle("is-active", filters.showCompleted);
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

  const stageSection = document.createElement("div");
  stageSection.className = "mc-toolbar-section";
  const stageLabel = document.createElement("span");
  stageLabel.className = "mc-toolbar-label";
  stageLabel.textContent = "Stage";
  stageSection.append(stageLabel, stageBar);

  const prioritySection = document.createElement("div");
  prioritySection.className = "mc-toolbar-section";
  const priorityLabel = document.createElement("span");
  priorityLabel.className = "mc-toolbar-label";
  priorityLabel.textContent = "Priority";
  prioritySection.append(priorityLabel, priorityBar);

  const utilityGroup = document.createElement("div");
  utilityGroup.className = "mc-toolbar-group";
  utilityGroup.append(density, sort, completed, refreshButton);

  toolbar.append(search, stageSection, prioritySection, utilityGroup);
  return {
    search,
    sort,
    firstStageChip: () => stageBar.querySelector<HTMLButtonElement>(".mc-chip"),
    refreshLabels: syncControls,
  };
}
