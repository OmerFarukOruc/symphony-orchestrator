import type { WorkflowColumn } from "../types/runtime.js";
import { getStageDescription } from "../components/state-guide.js";
import { hasActiveFilters, type QueueFilters } from "./queue-state";
import { createIcon } from "../ui/icons.js";
import { createIconButton } from "../ui/buttons.js";

interface ChipOptions {
  ariaLabel?: string;
  classNames?: string[];
  count?: number;
  title?: string;
}

function chip(label: string, onClick: () => void, options: ChipOptions = {}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("mc-chip", "is-interactive", ...(options.classNames ?? []));
  if (options.ariaLabel) {
    button.setAttribute("aria-label", options.ariaLabel);
  }
  if (options.title) {
    button.title = options.title;
  }
  const labelSpan = document.createElement("span");
  labelSpan.className = "queue-chip-label";
  labelSpan.textContent = label;
  button.append(labelSpan);
  if (options.count !== undefined) {
    const count = document.createElement("span");
    count.className = "queue-chip-count";
    count.textContent = String(options.count);
    button.append(count);
  }
  button.addEventListener("click", onClick);
  return button;
}

function iconButton(
  iconName: Parameters<typeof createIcon>[0],
  tooltip: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = createIconButton({
    iconName,
    label: tooltip,
    className: "toolbar-icon-btn",
  });
  button.addEventListener("click", onClick);
  return button;
}

function createCompletedToggleButton(active: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button is-ghost is-sm queue-completed-toggle";
  button.append(
    createIcon(active ? "eye" : "eyeOff", { size: 16 }),
    Object.assign(document.createElement("span"), {
      className: "queue-completed-toggle-label",
      textContent: "Completed",
    }),
  );
  button.title = active ? "Hide completed work" : "Show completed work";
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("is-active", active);
  button.addEventListener("click", onClick);
  return button;
}

function createDensityToggleButton(density: string, onClick: () => void): HTMLButtonElement {
  const comfy = density === "comfortable";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button is-ghost is-sm queue-density-toggle";
  const label = Object.assign(document.createElement("span"), {
    className: "queue-density-toggle-label",
    textContent: comfy ? "Comfortable" : "Compact",
  });
  label.setAttribute("aria-hidden", "true");
  button.append(createIcon(comfy ? "unfold" : "dense", { size: 16 }), label);
  button.title = comfy ? "Switch to compact view" : "Switch to comfortable view";
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("is-active", comfy);
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
      existing.issues = [...(existing.issues ?? []), ...(column.issues ?? [])];
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
  onReset: () => void;
  onSearchChange: (value: string) => void;
  onToggleStage: (stageKey: string) => void;
  onSetPriority: (priority: string) => void;
  onSetSort: (sort: string) => void;
  onToggleDensity: () => void;
  onToggleCompleted: () => void;
}

export function buildQueueToolbar(options: QueueToolbarOptions): {
  search: HTMLInputElement;
  firstStageChip: () => HTMLButtonElement | null;
} {
  const {
    toolbar,
    filters,
    columns,
    onRefresh,
    onReset,
    onSearchChange,
    onToggleStage,
    onSetPriority,
    onSetSort,
    onToggleDensity,
    onToggleCompleted,
  } = options;
  toolbar.replaceChildren();

  const search = Object.assign(document.createElement("input"), {
    className: "mc-input",
    placeholder: "Search issues, titles, or IDs\u2026",
  });
  search.setAttribute("aria-label", "Search issues");
  search.value = filters.search;

  const searchHint = document.createElement("kbd");
  searchHint.className = "mc-button-hint queue-search-hint";
  searchHint.textContent = "/";
  searchHint.title = "Press / to focus search";
  searchHint.setAttribute("aria-hidden", "true");

  const searchWrap = document.createElement("div");
  searchWrap.className = "queue-toolbar-search";
  searchWrap.append(search, searchHint);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "mc-button is-ghost is-sm queue-toolbar-reset";
  resetBtn.textContent = "Reset";
  resetBtn.title = "Clear all filters (Esc)";
  resetBtn.hidden = !hasActiveFilters(filters);
  resetBtn.addEventListener("click", () => {
    onReset();
    search.value = filters.search;
    sort.value = filters.sort;
    renderStages();
    renderPriorities();
    updateResetVisibility();
    syncControls();
  });

  function updateResetVisibility(): void {
    resetBtn.hidden = !hasActiveFilters(filters);
  }

  const stageBar = document.createElement("div");
  stageBar.className = "mc-toolbar-group queue-toolbar-stages";
  stageBar.setAttribute("role", "group");
  stageBar.setAttribute("aria-label", "Workflow stages");

  const priorityBar = document.createElement("div");
  priorityBar.className = "mc-toolbar-group queue-toolbar-priority";
  priorityBar.setAttribute("role", "group");
  priorityBar.setAttribute("aria-label", "Priority");

  const mergedColumns = mergeColumns(columns);

  function renderStages(): void {
    stageBar.replaceChildren(
      ...mergedColumns.map((column) => {
        const active = filters.stages.has(column.key);
        const normalizedKey = normalizeStageKey(column.key);
        const button = chip(
          column.label,
          () => {
            onToggleStage(column.key);
            renderStages();
            updateResetVisibility();
          },
          {
            ariaLabel: column.count > 0 ? `${column.label}, ${column.count} issues` : `${column.label}, no issues`,
            classNames: ["queue-stage-chip", `queue-stage-chip-${normalizedKey}`],
            count: column.count > 0 ? column.count : undefined,
            title: getStageDescription(column.key),
          },
        );
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.dataset.stage = normalizedKey;
        return button;
      }),
    );
  }

  function renderPriorities(): void {
    priorityBar.replaceChildren(
      ...[
        ["urgent", "Urgent"],
        ["high", "High"],
        ["medium", "Medium"],
        ["low", "Low"],
      ].map(([value, label]) => {
        const active = filters.priority === value;
        const button = chip(
          label,
          () => {
            onSetPriority(active ? "all" : value);
            renderPriorities();
            updateResetVisibility();
          },
          {
            classNames: ["queue-priority-chip", `queue-priority-chip-${value}`],
            title: active ? "Click to clear priority filter" : `Filter: ${label} priority`,
          },
        );
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        return button;
      }),
    );
  }

  const sort = document.createElement("select");
  sort.className = "mc-select";
  sort.classList.add("toolbar-sort-select");
  sort.setAttribute("aria-label", "Board order");
  [
    ["updated", "Recently updated"],
    ["priority", "Priority first"],
    ["tokens", "Highest token usage"],
  ].forEach(([value, label]) => {
    const option = Object.assign(document.createElement("option"), { value, textContent: label });
    option.selected = filters.sort === value;
    sort.append(option);
  });

  const densityBtn = createDensityToggleButton(filters.density, () => {
    onToggleDensity();
    syncControls();
  });

  const completedBtn = createCompletedToggleButton(filters.showCompleted, () => {
    onToggleCompleted();
    syncControls();
  });

  const refreshBtn = iconButton("refresh", "Refresh queue", onRefresh);

  const utilityCluster = document.createElement("div");
  utilityCluster.className = "queue-toolbar-utility";
  utilityCluster.append(sort, densityBtn, completedBtn, resetBtn, refreshBtn);

  function syncControls(): void {
    /* density */
    const comfy = filters.density === "comfortable";
    const densityLabel = Object.assign(document.createElement("span"), {
      className: "queue-density-toggle-label",
      textContent: comfy ? "Comfortable" : "Compact",
    });
    densityLabel.setAttribute("aria-hidden", "true");
    densityBtn.replaceChildren(createIcon(comfy ? "unfold" : "dense", { size: 16 }), densityLabel);
    densityBtn.title = comfy ? "Switch to compact view" : "Switch to comfortable view";
    densityBtn.setAttribute("aria-label", densityBtn.title);
    densityBtn.classList.toggle("is-active", comfy);

    /* completed */
    completedBtn.replaceChildren(
      createIcon(filters.showCompleted ? "eye" : "eyeOff", { size: 16 }),
      Object.assign(document.createElement("span"), {
        className: "queue-completed-toggle-label",
        textContent: "Completed",
      }),
    );
    completedBtn.title = filters.showCompleted ? "Hide completed work" : "Show completed work";
    completedBtn.setAttribute("aria-label", completedBtn.title);
    completedBtn.classList.toggle("is-active", filters.showCompleted);
  }

  search.addEventListener("input", () => {
    onSearchChange(search.value);
    updateResetVisibility();
  });
  sort.addEventListener("change", () => {
    onSetSort(sort.value);
  });
  renderStages();
  renderPriorities();

  toolbar.append(searchWrap, stageBar, priorityBar, utilityCluster);
  return {
    search,
    firstStageChip: () => stageBar.querySelector<HTMLButtonElement>(".mc-chip"),
  };
}
