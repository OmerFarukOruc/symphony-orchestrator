const COLLAPSED_KEY = "risoluto-overview-collapsed";

/**
 * Reads the set of collapsed section IDs from localStorage.
 */
export function readCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore corrupted data */
  }
  return new Set<string>();
}

/**
 * Persists the set of collapsed section IDs to localStorage.
 */
export function saveCollapsedSections(ids: Set<string>): void {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
}

/**
 * Creates a section header with title and optional kicker.
 */
export function createSectionHeader(title: string, kicker?: string): HTMLElement {
  const header = document.createElement("div");
  header.className = "overview-section-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "overview-section-title";
  titleEl.textContent = title;
  header.append(titleEl);

  if (kicker) {
    const kickerEl = document.createElement("span");
    kickerEl.className = "overview-section-kicker";
    kickerEl.textContent = kicker;
    header.append(kickerEl);
  }

  return header;
}

/**
 * Creates a collapsible section wrapper with a summary line.
 * The section header acts as the disclosure toggle.
 * The summary is shown next to the header when collapsed.
 */
export function createCollapsibleSection(
  id: string,
  title: string,
  kicker: string,
  collapsed: Set<string>,
): {
  section: HTMLElement;
  body: HTMLElement;
  summary: HTMLElement;
  setExpanded: (expanded: boolean) => void;
} {
  const section = document.createElement("div");
  section.className = "overview-collapsible-section";
  section.dataset.sectionId = id;

  const header = document.createElement("button");
  header.type = "button";
  header.className = "overview-collapsible-header";
  header.setAttribute("aria-expanded", String(!collapsed.has(id)));

  const titleEl = document.createElement("h2");
  titleEl.className = "overview-section-title";
  titleEl.textContent = title;

  const kickerEl = document.createElement("span");
  kickerEl.className = "overview-section-kicker";
  kickerEl.textContent = kicker;

  const chevron = document.createElement("span");
  chevron.className = "overview-collapsible-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "\u25B8"; // right-pointing triangle

  const summary = document.createElement("span");
  summary.className = "overview-collapsible-summary";

  header.append(chevron, titleEl, kickerEl, summary);

  const body = document.createElement("div");
  body.className = "overview-collapsible-body";

  section.append(header, body);

  function setExpanded(expanded: boolean): void {
    header.setAttribute("aria-expanded", String(expanded));
    section.classList.toggle("is-collapsed", !expanded);
    body.hidden = !expanded;
    summary.hidden = expanded;
    if (expanded) {
      collapsed.delete(id);
    } else {
      collapsed.add(id);
    }
    saveCollapsedSections(collapsed);
  }

  header.addEventListener("click", () => {
    const isExpanded = header.getAttribute("aria-expanded") === "true";
    setExpanded(!isExpanded);
  });

  // Apply initial collapsed state
  const isCollapsed = collapsed.has(id);
  section.classList.toggle("is-collapsed", isCollapsed);
  body.hidden = isCollapsed;
  summary.hidden = !isCollapsed;

  return { section, body, summary, setExpanded };
}
