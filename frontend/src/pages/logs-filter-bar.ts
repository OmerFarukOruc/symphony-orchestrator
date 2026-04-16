import {
  CATEGORY_ORDER,
  classifyEvent,
  getCategoryLabel,
  getCategoryTooltip,
  type EventCategory,
} from "../utils/events.js";
import type { RecentEvent } from "../types/runtime.js";
import { createIconButton } from "../ui/buttons.js";
import type { SortDirection } from "../state/log-buffer.js";

type ChipState = "active" | "partial" | "inactive";

interface ViewActionSpec {
  iconName: Parameters<typeof createIconButton>[0]["iconName"];
  label: string;
  tooltipLabel: string;
}

/** Builds a labelled icon button for the view-actions toolbar strip. */
function makeViewActionButton(spec: ViewActionSpec): HTMLButtonElement {
  const button = createIconButton({
    iconName: spec.iconName,
    label: spec.tooltipLabel,
    iconSize: 15,
    className: "logs-icon-btn logs-view-action",
  });
  const text = document.createElement("span");
  text.className = "logs-view-action-label";
  text.textContent = spec.label;
  button.append(text);
  return button;
}

/**
 * Builds a single category/kind chip button.
 * Exported so the detail-panel module can reuse it without duplication.
 */
export function makeCategoryChip(options: {
  label: string;
  title: string;
  state: ChipState;
  category: EventCategory | null;
  count: number;
  onToggle: () => void;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  const categoryClass = options.category === null ? "" : ` mc-chip-category-${options.category}`;
  const stateClass = options.state === "active" ? " is-active" : options.state === "partial" ? " is-partial" : "";
  button.className = `mc-chip is-interactive${stateClass}${categoryClass}`;
  button.title = options.title;
  button.setAttribute("aria-pressed", options.state === "active" ? "true" : "false");
  if (options.state === "partial") {
    button.setAttribute("aria-checked", "mixed");
  }
  const text = document.createElement("span");
  text.className = "logs-chip-label";
  text.textContent = options.label;
  const countEl = document.createElement("span");
  countEl.className = "logs-chip-count";
  countEl.textContent = String(options.count);
  button.append(text, countEl);
  button.addEventListener("click", options.onToggle);
  return button;
}

/** Per-category event index used for chip rendering. */
export interface CategoryBucket {
  count: number;
  kinds: Set<string>;
}

/**
 * Single-pass index of buffer events by category. Each bucket tracks the
 * total event count and the set of distinct kinds present.
 */
export function buildCategoryIndex(events: RecentEvent[]): Map<EventCategory, CategoryBucket> {
  const index = new Map<EventCategory, CategoryBucket>();
  for (const category of CATEGORY_ORDER) {
    index.set(category, { count: 0, kinds: new Set() });
  }
  for (const event of events) {
    const bucket = index.get(classifyEvent(event));
    if (!bucket) continue;
    bucket.count++;
    bucket.kinds.add(event.event);
  }
  return index;
}

/** Counts how many kinds from the given set are currently active. */
export function countActiveKinds(kinds: Set<string>, activeKinds: Set<string>): number {
  let active = 0;
  for (const k of kinds) {
    if (activeKinds.has(k)) active++;
  }
  return active;
}

function buildCategoryChip(
  category: EventCategory,
  bucket: CategoryBucket,
  activeKinds: Set<string>,
  onToggle: (category: EventCategory, fallback: Set<string>) => void,
): HTMLButtonElement {
  const { count, kinds } = bucket;
  const activeInCategory = countActiveKinds(kinds, activeKinds);
  const state: ChipState = activeInCategory === 0 ? "inactive" : activeInCategory === kinds.size ? "active" : "partial";
  return makeCategoryChip({
    label: getCategoryLabel(category),
    title: getCategoryTooltip(category),
    state,
    category,
    count,
    onToggle: () => onToggle(category, kinds),
  });
}

export interface LogFilterBarOptions {
  /** The current active-kinds set from the logs timeline state. */
  activeKinds: Set<string>;
  /** Called when all category filters should be cleared. */
  onClearCategories: () => void;
  /** Called when a category chip toggles all of its kinds. */
  onToggleCategoryKinds: (kinds: Iterable<string>) => void;
  /** Called whenever the search input changes. */
  onSearchChange: (value: string) => void;
  /** Called when sort direction should toggle. */
  onSortToggle: (newDirection: SortDirection) => void;
  /** Called when density toggles. */
  onDensityToggle: () => void;
  /** Called when auto-scroll toggles. */
  onAutoScrollToggle: () => void;
  /** Called when expand-all toggles. */
  onExpandToggle: () => void;
  /** Called when copy-all is requested. */
  onCopyAll: () => void;
  /** Called when the detail-filters panel should open. */
  onOpenDetailPanel: () => void;
  /** Called when the detail-filters panel should close. */
  onCloseDetailPanel: () => void;
  /** Returns the current sort direction so the button can reflect state. */
  getSortDirection: () => SortDirection;
  /** Returns all current buffer events for chip count calculation. */
  getEvents: () => RecentEvent[];
}

export interface LogFilterBarHandle {
  /** The root `.logs-control` element — append into the page. */
  element: HTMLElement;
  /** The `.logs-filter-row` — used by renderCategoryChips to replace children. */
  filterRow: HTMLDivElement;
  /** The search input element. */
  search: HTMLInputElement;
  /** The detail-filters trigger button. */
  detailFiltersBtn: HTMLButtonElement;
  /** The badge span inside the detail-filters button. */
  detailFiltersBadge: HTMLSpanElement;
  /** The view-action sort toggle button. */
  sortToggle: HTMLButtonElement;
  /** The view-action density toggle button. */
  densityToggle: HTMLButtonElement;
  /** The view-action auto-scroll toggle button. */
  autoToggle: HTMLButtonElement;
  /** The view-action expand toggle button. */
  expandToggle: HTMLButtonElement;
  /** The view-action copy-all button. */
  copyAllBtn: HTMLButtonElement;
  /** The inline detail panel placeholder — caller appends its own panel element here. */
  detailPanelSlot: HTMLElement;
  /** Returns whether the detail-filters panel is open. */
  isDetailPanelOpen: () => boolean;
  /** Closes the detail-filters panel. */
  closeDetailPanel: () => void;
  /**
   * Re-renders the category chips based on the current buffer events and
   * active-kinds set. Call after any filter-state or buffer change.
   */
  renderCategoryChips: () => void;
  /**
   * Updates the badge count and active class on the detail-filters button.
   * Call after any active-kinds change.
   */
  updateDetailFiltersBadge: () => void;
  /**
   * Syncs all view-action button visual states (active class, title, etc.)
   * to the current caller-owned state.
   */
  syncViewActions: (state: {
    autoScroll: boolean;
    density: "compact" | "comfortable";
    expandedCount: number;
    sortDirection: SortDirection;
  }) => void;
}

/**
 * Builds the logs filter bar: category chip row, search input, detail-filters
 * trigger, and view-action buttons. Stateless — all mutable state lives in the
 * caller. Returns a handle exposing the elements the caller needs to sync.
 */
export function buildLogFilterBar(options: LogFilterBarOptions): LogFilterBarHandle {
  const { activeKinds, onClearCategories, onToggleCategoryKinds, onSearchChange, onSortToggle } = options;
  const { onDensityToggle, onAutoScrollToggle } = options;
  const { onExpandToggle, onCopyAll, onOpenDetailPanel, onCloseDetailPanel, getSortDirection, getEvents } = options;

  // ── Root ─────────────────────────────────────────────────────────────
  const controls = document.createElement("section");
  controls.className = "logs-control";
  controls.setAttribute("role", "toolbar");
  controls.setAttribute("aria-label", "Log filters");

  // ── Row 1: primary category chips ────────────────────────────────────
  const filterRow = document.createElement("div");
  filterRow.className = "logs-filter-row";
  filterRow.setAttribute("role", "group");
  filterRow.setAttribute("aria-label", "Filter by category");

  // ── Row 2: search + detail filters + view actions ─────────────────────
  const utilityRow = document.createElement("div");
  utilityRow.className = "logs-utility-row";

  const search = Object.assign(document.createElement("input"), {
    className: "mc-input logs-search",
    placeholder: "Search messages, kinds, or payloads",
  });
  search.setAttribute("aria-label", "Search messages, kinds, or payloads");

  const detailFiltersBtn = document.createElement("button");
  detailFiltersBtn.type = "button";
  detailFiltersBtn.className = "mc-button is-sm logs-detail-filters-btn";
  detailFiltersBtn.setAttribute("aria-expanded", "false");
  detailFiltersBtn.setAttribute("aria-controls", "logs-detail-panel");

  const detailFiltersLabel = document.createElement("span");
  detailFiltersLabel.textContent = "Event filters";
  const detailFiltersBadge = document.createElement("span");
  detailFiltersBadge.className = "logs-detail-filters-badge";
  detailFiltersBadge.hidden = true;
  const detailFiltersCaret = document.createElement("span");
  detailFiltersCaret.className = "logs-detail-filters-caret";
  detailFiltersCaret.setAttribute("aria-hidden", "true");
  detailFiltersCaret.textContent = "▾";
  detailFiltersBtn.append(detailFiltersLabel, detailFiltersBadge, detailFiltersCaret);

  const utilityLeft = document.createElement("div");
  utilityLeft.className = "logs-utility-left";
  utilityLeft.append(search);

  const utilityRight = document.createElement("div");
  utilityRight.className = "logs-utility-right";
  utilityRight.append(detailFiltersBtn);

  // ── View action buttons ───────────────────────────────────────────────
  const viewActions = document.createElement("div");
  viewActions.className = "logs-view-actions";

  const sortToggle = makeViewActionButton({ iconName: "sort", label: "Newest", tooltipLabel: "Sort order" });
  sortToggle.title = "Newest first";
  const densityToggle = makeViewActionButton({
    iconName: "dense",
    label: "Compact",
    tooltipLabel: "Toggle density",
  });
  const autoToggle = makeViewActionButton({
    iconName: "scrollDown",
    label: "Follow",
    tooltipLabel: "Follow live",
  });
  const expandToggle = makeViewActionButton({
    iconName: "unfold",
    label: "Expand",
    tooltipLabel: "Expand payloads",
  });
  const copyAllBtn = makeViewActionButton({ iconName: "copy", label: "Copy", tooltipLabel: "Copy all logs" });

  const viewActionsDivider = document.createElement("span");
  viewActionsDivider.className = "logs-view-actions-divider";
  viewActionsDivider.setAttribute("role", "separator");
  viewActionsDivider.setAttribute("aria-orientation", "vertical");

  viewActions.append(sortToggle, densityToggle, autoToggle, expandToggle, viewActionsDivider, copyAllBtn);
  utilityRight.append(viewActions);
  utilityRow.append(utilityLeft, utilityRight);

  // ── Detail panel slot (appended last so it renders below the utility row) ─
  const detailPanelSlot = document.createElement("div");
  detailPanelSlot.className = "logs-detail-panel-slot";

  controls.append(filterRow, utilityRow, detailPanelSlot);

  function isDetailPanelOpen(): boolean {
    return detailFiltersBtn.getAttribute("aria-expanded") === "true";
  }

  function closeDetailPanel(): void {
    detailFiltersBtn.setAttribute("aria-expanded", "false");
    detailFiltersBtn.classList.remove("is-open");
    onCloseDetailPanel();
  }

  // ── Chip rendering helpers ────────────────────────────────────────────
  function renderCategoryChips(): void {
    const index = buildCategoryIndex(getEvents());
    let totalCount = 0;
    for (const bucket of index.values()) totalCount += bucket.count;

    const chips: HTMLButtonElement[] = [
      makeCategoryChip({
        label: "All",
        title: "Show all events",
        state: activeKinds.size === 0 ? "active" : "inactive",
        category: null,
        count: totalCount,
        onToggle: onClearCategories,
      }),
    ];

    for (const category of CATEGORY_ORDER) {
      const bucket = index.get(category);
      if (!bucket) continue;
      if (bucket.count === 0 && countActiveKinds(bucket.kinds, activeKinds) === 0) continue;
      chips.push(
        buildCategoryChip(category, bucket, activeKinds, (cat, fallback) => {
          const fresh = buildCategoryIndex(getEvents()).get(cat)?.kinds ?? fallback;
          onToggleCategoryKinds(fresh);
        }),
      );
    }

    filterRow.replaceChildren(...chips);
  }

  function updateDetailFiltersBadge(): void {
    if (activeKinds.size === 0) {
      detailFiltersBadge.hidden = true;
      detailFiltersBadge.textContent = "";
      detailFiltersBtn.classList.remove("is-active");
      detailFiltersBtn.setAttribute("aria-label", "Event filters");
    } else {
      detailFiltersBadge.hidden = false;
      detailFiltersBadge.textContent = String(activeKinds.size);
      detailFiltersBtn.classList.add("is-active");
      detailFiltersBtn.setAttribute("aria-label", `Event filters, ${activeKinds.size} active`);
    }
  }

  function setActionLabel(button: HTMLButtonElement, label: string): void {
    const labelElement = button.querySelector(".logs-view-action-label");
    if (labelElement) {
      labelElement.textContent = label;
    }
  }

  function syncActionButton(
    button: HTMLButtonElement,
    options: {
      active: boolean;
      pressed?: boolean;
      title: string;
      ariaLabel: string;
      label: string;
      flipped?: boolean;
    },
  ): void {
    button.classList.toggle("is-active", options.active);
    button.classList.toggle("is-flipped", options.flipped === true);
    if (options.pressed !== undefined) {
      button.setAttribute("aria-pressed", String(options.pressed));
    }
    button.title = options.title;
    button.setAttribute("aria-label", options.ariaLabel);
    setActionLabel(button, options.label);
  }

  function syncViewActions(state: {
    autoScroll: boolean;
    density: "compact" | "comfortable";
    expandedCount: number;
    sortDirection: SortDirection;
  }): void {
    syncActionButton(sortToggle, {
      active: false,
      flipped: state.sortDirection === "asc",
      title: state.sortDirection === "desc" ? "Showing newest first" : "Showing oldest first",
      ariaLabel: state.sortDirection === "desc" ? "Sort order: newest first" : "Sort order: oldest first",
      label: state.sortDirection === "desc" ? "Newest" : "Oldest",
    });
    syncActionButton(densityToggle, {
      active: state.density === "compact",
      pressed: state.density === "compact",
      title: state.density === "compact" ? "Compact density is on" : "Comfortable density is on",
      ariaLabel: state.density === "compact" ? "Density: compact" : "Density: comfortable",
      label: state.density === "compact" ? "Compact" : "Comfortable",
    });
    syncActionButton(autoToggle, {
      active: state.autoScroll,
      pressed: state.autoScroll,
      title: state.autoScroll ? "Following live updates" : "Follow live updates",
      ariaLabel: state.autoScroll ? "Following live updates" : "Follow live updates",
      label: state.autoScroll ? "Following" : "Follow",
    });
    syncActionButton(expandToggle, {
      active: state.expandedCount > 0,
      pressed: state.expandedCount > 0,
      title: state.expandedCount > 0 ? "Collapse expanded payloads" : "Expand payloads",
      ariaLabel: state.expandedCount > 0 ? "Collapse expanded payloads" : "Expand payloads",
      label: state.expandedCount > 0 ? "Collapse" : "Expand",
    });
  }

  // ── Event wiring ──────────────────────────────────────────────────────
  detailFiltersBtn.addEventListener("click", () => {
    if (isDetailPanelOpen()) {
      closeDetailPanel();
    } else {
      detailFiltersBtn.setAttribute("aria-expanded", "true");
      detailFiltersBtn.classList.add("is-open");
      onOpenDetailPanel();
    }
  });

  filterRow.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const chips = Array.from(filterRow.querySelectorAll<HTMLButtonElement>("button.mc-chip"));
    const currentIndex = chips.findIndex((chip) => chip === document.activeElement);
    if (currentIndex === -1) return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    const next = chips[(currentIndex + delta + chips.length) % chips.length];
    next.focus();
  });

  sortToggle.addEventListener("click", () => {
    const newDir: SortDirection = getSortDirection() === "desc" ? "asc" : "desc";
    onSortToggle(newDir);
  });

  densityToggle.addEventListener("click", onDensityToggle);
  autoToggle.addEventListener("click", onAutoScrollToggle);
  expandToggle.addEventListener("click", onExpandToggle);
  copyAllBtn.addEventListener("click", onCopyAll);
  search.addEventListener("input", () => onSearchChange(search.value));

  return {
    element: controls,
    filterRow,
    search,
    detailFiltersBtn,
    detailFiltersBadge,
    sortToggle,
    densityToggle,
    autoToggle,
    expandToggle,
    copyAllBtn,
    detailPanelSlot,
    isDetailPanelOpen,
    closeDetailPanel,
    renderCategoryChips,
    updateDetailFiltersBadge,
    syncViewActions,
  };
}
