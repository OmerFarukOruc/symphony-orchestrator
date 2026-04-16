import {
  CATEGORY_ORDER,
  classifyEvent,
  eventTypeLabel,
  getCategoryLabel,
  getEventTooltip,
  type EventCategory,
} from "../utils/events.js";
import type { RecentEvent } from "../types/runtime.js";
import { makeCategoryChip } from "./logs-filter-bar.js";

interface KindEntry {
  kind: string;
  label: string;
  count: number;
}

/** Groups buffer events by category, deduped by display label. */
function buildKindsByCategory(events: RecentEvent[]): Map<EventCategory, Map<string, KindEntry>> {
  const byCategory = new Map<EventCategory, Map<string, KindEntry>>();
  for (const event of events) {
    const category = classifyEvent(event);
    const label = eventTypeLabel(event.event);
    let byLabel = byCategory.get(category);
    if (!byLabel) {
      byLabel = new Map();
      byCategory.set(category, byLabel);
    }
    const existing = byLabel.get(label);
    if (existing) {
      existing.count++;
    } else {
      byLabel.set(label, { kind: event.event, label, count: 1 });
    }
  }
  return byCategory;
}

function buildEmptyNotice(): HTMLParagraphElement {
  const empty = document.createElement("p");
  empty.className = "logs-detail-panel-empty";
  empty.textContent = "No event kinds are available yet.";
  return empty;
}

function buildSectionChips(
  byLabel: Map<string, KindEntry>,
  category: EventCategory,
  activeKinds: Set<string>,
  onToggleKind: (kind: string) => void,
): HTMLDivElement {
  const items = [...byLabel.values()].sort((a, b) => b.count - a.count);
  const chipWrap = document.createElement("div");
  chipWrap.className = "logs-detail-panel-chips";
  for (const { kind, label, count } of items) {
    chipWrap.append(
      makeCategoryChip({
        label,
        title: getEventTooltip(kind) || kind,
        state: activeKinds.has(kind) ? "active" : "inactive",
        category,
        count,
        onToggle: () => onToggleKind(kind),
      }),
    );
  }
  return chipWrap;
}

function buildCategorySection(
  category: EventCategory,
  byLabel: Map<string, KindEntry>,
  activeKinds: Set<string>,
  onToggleKind: (kind: string) => void,
): HTMLElement {
  const section = document.createElement("section");
  section.className = `logs-detail-panel-section logs-detail-panel-section-${category}`;
  const sectionHeader = document.createElement("div");
  sectionHeader.className = "logs-detail-panel-section-header";
  sectionHeader.textContent = getCategoryLabel(category);
  section.append(sectionHeader, buildSectionChips(byLabel, category, activeKinds, onToggleKind));
  return section;
}

export interface DetailFiltersPanelOptions {
  /** The current active-kinds set — read-only here; mutations go through callbacks. */
  activeKinds: Set<string>;
  /** Returns the current buffer events for count/category calculation. */
  getEvents: () => RecentEvent[];
  /** Called when "Clear all" is clicked. */
  onClearAll: () => void;
  /** Called when a single kind chip is toggled. */
  onToggleKind: (kind: string) => void;
}

export interface DetailFiltersPanelHandle {
  /** The root `.logs-detail-panel` element — hidden by default. */
  element: HTMLElement;
  /**
   * Re-renders the panel content from scratch using the current buffer events
   * and active-kinds set. Call whenever the panel is opened or the buffer changes.
   */
  render: () => void;
  /** Shows the panel. */
  open: () => void;
  /** Hides the panel. */
  close: () => void;
}

/**
 * Builds the detail-filters inline panel. Stateless — all mutable state lives
 * in the caller. The panel is hidden by default; call `open()` to show it.
 */
export function buildDetailFiltersPanel(options: DetailFiltersPanelOptions): DetailFiltersPanelHandle {
  const { activeKinds, getEvents, onClearAll, onToggleKind } = options;

  const panel = document.createElement("div");
  panel.id = "logs-detail-panel";
  panel.className = "logs-detail-panel";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Event filters");
  panel.hidden = true;

  function render(): void {
    panel.replaceChildren();

    const heading = document.createElement("div");
    heading.className = "logs-detail-panel-header";
    const title = document.createElement("h3");
    title.className = "logs-panel-title";
    title.textContent = "Event filters";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "mc-button is-sm is-ghost logs-detail-clear";
    clearBtn.textContent = "Clear all";
    clearBtn.disabled = activeKinds.size === 0;
    clearBtn.addEventListener("click", onClearAll);
    heading.append(title, clearBtn);
    panel.append(heading);

    const byCategory = buildKindsByCategory(getEvents());
    if (byCategory.size === 0) {
      panel.append(buildEmptyNotice());
      return;
    }

    const sectionsWrap = document.createElement("div");
    sectionsWrap.className = "logs-detail-panel-sections";
    for (const category of CATEGORY_ORDER) {
      const byLabel = byCategory.get(category);
      if (!byLabel || byLabel.size === 0) continue;
      sectionsWrap.append(buildCategorySection(category, byLabel, activeKinds, onToggleKind));
    }
    panel.append(sectionsWrap);
  }

  function open(): void {
    panel.hidden = false;
    render();
  }

  function close(): void {
    panel.hidden = true;
  }

  return { element: panel, render, open, close };
}
