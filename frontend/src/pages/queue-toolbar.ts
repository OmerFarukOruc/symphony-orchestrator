import type { WorkflowColumn } from "../types";
import type { QueueFilters } from "./queue-state";
import { createIcon } from "../ui/icons.js";
import { createIconButton } from "../ui/buttons.js";

interface ChipOptions {
  ariaLabel?: string;
  classNames?: string[];
  count?: number;
}

function chip(label: string, onClick: () => void, options: ChipOptions = {}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("mc-chip", "is-interactive", ...(options.classNames ?? []));
  if (options.ariaLabel) {
    button.setAttribute("aria-label", options.ariaLabel);
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

function utilitySep(): HTMLSpanElement {
  const sep = document.createElement("span");
  sep.className = "toolbar-utility-sep";
  sep.setAttribute("role", "separator");
  return sep;
}

function utilityLabel(text: string): HTMLSpanElement {
  const label = document.createElement("span");
  label.className = "toolbar-utility-label";
  label.textContent = text;
  return label;
}

function filterGroup(label: string, className: string, content: HTMLElement): HTMLDivElement {
  const group = document.createElement("div");
  group.className = `toolbar-filter-group ${className}`;
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", label);
  const groupLabel = utilityLabel(label);
  groupLabel.classList.add("toolbar-filter-label");
  group.append(groupLabel, content);
  return group;
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
  onChange: () => void;
}

export function buildQueueToolbar(options: QueueToolbarOptions): {
  search: HTMLInputElement;
  sort: HTMLSelectElement;
  firstStageChip: () => HTMLButtonElement | null;
  refreshLabels: () => void;
} {
  const { toolbar, filters, columns, onRefresh, onChange } = options;
  toolbar.replaceChildren();

  const search = Object.assign(document.createElement("input"), {
    className: "mc-input",
    placeholder: "Search issues, titles, or IDs\u2026",
  });
  search.setAttribute("aria-label", "Search issues");
  search.value = filters.search;

  const searchRow = document.createElement("div");
  searchRow.className = "toolbar-search-row";
  searchRow.append(search);

  const stageBar = document.createElement("div");
  stageBar.className = "mc-toolbar-group";

  const priorityBar = document.createElement("div");
  priorityBar.className = "mc-toolbar-group";

  const mergedColumns = mergeColumns(columns);

  function renderStages(): void {
    stageBar.replaceChildren(
      ...mergedColumns.map((column) => {
        const active = filters.stages.has(column.key);
        const normalizedKey = normalizeStageKey(column.key);
        const button = chip(
          column.label,
          () => {
            if (filters.stages.has(column.key)) filters.stages.delete(column.key);
            else filters.stages.add(column.key);
            renderStages();
            onChange();
          },
          {
            ariaLabel: column.count > 0 ? `${column.label}, ${column.count} issues` : `${column.label}, no issues`,
            classNames: ["queue-stage-chip", `queue-stage-chip-${normalizedKey}`],
            count: column.count > 0 ? column.count : 0,
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
        ["all", "Any priority"],
        ["urgent", "Urgent"],
        ["high", "High"],
        ["medium", "Medium"],
        ["low", "Low"],
      ].map(([value, label]) => {
        const active = filters.priority === value;
        const button = chip(
          label,
          () => {
            filters.priority = value;
            renderPriorities();
            onChange();
          },
          {
            classNames: ["queue-priority-chip", `queue-priority-chip-${value}`],
          },
        );
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        return button;
      }),
    );
  }

  const filterRow = document.createElement("div");
  filterRow.className = "toolbar-filter-row";
  filterRow.append(
    filterGroup("Workflow stages", "toolbar-filter-group-stages", stageBar),
    filterGroup("Priority", "toolbar-filter-group-priority", priorityBar),
  );

  /* ─── Utility row: view-options (left) │ actions (right) ─── */

  const sort = document.createElement("select");
  sort.className = "mc-select";
  sort.classList.add("toolbar-sort-select");
  sort.setAttribute("aria-label", "Board order");
  sort.title = "Arrange board lanes";
  [
    ["updated", "Recently updated"],
    ["priority", "Priority first"],
    ["tokens", "Highest token usage"],
  ].forEach(([value, label]) => {
    const option = Object.assign(document.createElement("option"), { value, textContent: label });
    option.selected = filters.sort === value;
    sort.append(option);
  });

  const sortGroup = document.createElement("div");
  sortGroup.className = "toolbar-utility-group toolbar-sort-group";
  sortGroup.append(
    createIcon("sort", { size: 14, className: "toolbar-utility-icon" }),
    utilityLabel("Board order"),
    sort,
  );

  const densityBtn = iconButton(
    filters.density === "comfortable" ? "unfold" : "dense",
    filters.density === "comfortable" ? "Switch to compact view" : "Switch to comfortable view",
    () => {
      filters.density = filters.density === "comfortable" ? "compact" : "comfortable";
      syncControls();
    },
  );
  densityBtn.classList.toggle("is-active", filters.density === "comfortable");

  const viewGroup = document.createElement("div");
  viewGroup.className = "toolbar-utility-group";
  viewGroup.append(sortGroup, densityBtn);

  const completedBtn = iconButton(
    filters.showCompleted ? "eye" : "eyeOff",
    filters.showCompleted ? "Hide completed work" : "Show completed work",
    () => {
      filters.showCompleted = !filters.showCompleted;
      syncControls();
    },
  );
  completedBtn.classList.toggle("is-active", filters.showCompleted);

  const completedLabel = document.createElement("span");
  completedLabel.className = "toolbar-icon-btn-label";
  completedLabel.textContent = "Completed";

  const completedGroup = document.createElement("div");
  completedGroup.className = "toolbar-utility-group";
  completedGroup.append(completedBtn, completedLabel);

  const refreshBtn = iconButton("refresh", "Refresh queue", onRefresh);

  const actionsGroup = document.createElement("div");
  actionsGroup.className = "toolbar-utility-group";
  actionsGroup.append(completedGroup, refreshBtn);

  function syncControls(): void {
    /* density */
    densityBtn.replaceChildren(createIcon(filters.density === "comfortable" ? "unfold" : "dense", { size: 16 }));
    densityBtn.title = filters.density === "comfortable" ? "Switch to compact view" : "Switch to comfortable view";
    densityBtn.setAttribute("aria-label", densityBtn.title);
    densityBtn.classList.toggle("is-active", filters.density === "comfortable");

    /* completed */
    completedBtn.replaceChildren(createIcon(filters.showCompleted ? "eye" : "eyeOff", { size: 16 }));
    completedBtn.title = filters.showCompleted ? "Hide completed work" : "Show completed work";
    completedBtn.setAttribute("aria-label", completedBtn.title);
    completedBtn.classList.toggle("is-active", filters.showCompleted);

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

  const utilityRow = document.createElement("div");
  utilityRow.className = "toolbar-utility-row";
  utilityRow.append(viewGroup, utilitySep(), actionsGroup);

  toolbar.append(searchRow, filterRow, utilityRow);
  return {
    search,
    sort,
    firstStageChip: () => stageBar.querySelector<HTMLButtonElement>(".mc-chip"),
    refreshLabels: syncControls,
  };
}
