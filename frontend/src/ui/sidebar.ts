import { api } from "../api";
import { router } from "../router";
import { buildSidebarBadgeCounts } from "./sidebar-badges.js";
import { createIcon, createIconSlot, type IconName } from "./icons";
import { navGroups, navItems } from "./nav-items";

const STORAGE_KEY = "risoluto-sidebar-expanded";
const MOBILE_BREAKPOINT = "(max-width: 760px)";

let _navHandler: (() => void) | null = null;
let _toggleHandler: (() => void) | null = null;
let _mobileHandler: (() => void) | null = null;
let _cachedMobileQuery: MediaQueryList | null = null;
let _contextualGroupEl: HTMLElement | null = null;

function readExpandedPref(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

function saveExpandedPref(expanded: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(expanded));
}

function updateActiveState(sidebarEl: HTMLElement): void {
  const current = window.location.pathname;
  for (const item of sidebarEl.querySelectorAll<HTMLElement>(".sidebar-item")) {
    const path = item.dataset.path ?? "";
    const exact = item.dataset.exact === "true";
    const active = exact ? current === path : current === path || (path !== "/" && current.startsWith(`${path}/`));
    item.classList.toggle("is-active", active);
  }
}

function syncBadgeVisibility(sidebarEl: HTMLElement): void {
  const expanded = sidebarEl.classList.contains("is-expanded") && !sidebarEl.classList.contains("is-mobile");
  for (const badge of sidebarEl.querySelectorAll<HTMLElement>(".sidebar-item-badge")) {
    const count = Number(badge.dataset.count ?? "0");
    badge.hidden = !expanded || count <= 0;
  }
}

function applyBadgeCounts(sidebarEl: HTMLElement, counts: Map<string, number>): void {
  for (const item of sidebarEl.querySelectorAll<HTMLElement>(".sidebar-item")) {
    const badge = item.querySelector<HTMLElement>(".sidebar-item-badge");
    if (!badge) {
      continue;
    }
    const count = counts.get(item.dataset.path ?? "") ?? 0;
    badge.dataset.count = String(count);
    badge.textContent = String(count);
  }
  syncBadgeVisibility(sidebarEl);
}

async function loadBadgeCounts(sidebarEl: HTMLElement): Promise<void> {
  try {
    const snapshot = await api.getState();
    applyBadgeCounts(sidebarEl, new Map(Object.entries(buildSidebarBadgeCounts(snapshot))));
  } catch {
    applyBadgeCounts(sidebarEl, new Map());
  }
}

function buildNavItems(groupEl: HTMLElement, groupName: string, onNavigate: () => void): void {
  const items = navItems.filter((item) => item.group === groupName);

  // Create items container for animation
  const itemsContainer = document.createElement("div");
  itemsContainer.className = "sidebar-group-items";

  const itemsInner = document.createElement("div");
  itemsInner.className = "sidebar-group-items-inner";

  for (const item of items) {
    const button = document.createElement("button");
    button.className = "sidebar-item transition-base";
    button.type = "button";
    button.dataset.path = item.path;
    button.title = `${item.name} (${item.hotkey.replace(" ", " then ")})`;
    button.setAttribute("aria-label", item.name);

    const labelSpan = document.createElement("span");
    labelSpan.className = "sidebar-item-label";
    labelSpan.textContent = item.name;

    const badgeSpan = document.createElement("span");
    badgeSpan.className = "sidebar-item-badge mc-badge is-sm";
    badgeSpan.dataset.count = "0";
    badgeSpan.hidden = true;

    const hotkeySpan = document.createElement("span");
    hotkeySpan.className = "sidebar-hotkey";
    hotkeySpan.textContent = item.hotkey;

    const tooltipSpan = document.createElement("span");
    tooltipSpan.className = "sidebar-item-tooltip";
    tooltipSpan.textContent = item.name;

    button.append(
      createIconSlot(item.icon, { slotClassName: "sidebar-icon", size: 18 }),
      labelSpan,
      badgeSpan,
      hotkeySpan,
      tooltipSpan,
    );
    button.addEventListener("click", () => {
      router.navigate(item.path);
      onNavigate();
    });
    itemsInner.append(button);
  }

  itemsContainer.append(itemsInner);
  groupEl.append(itemsContainer);
}

function buildGroupHeader(groupName: string, groupEl: HTMLElement): HTMLButtonElement {
  const header = document.createElement("button");
  header.className = "sidebar-group-header";
  header.type = "button";
  header.setAttribute("aria-expanded", "true");
  header.setAttribute("aria-controls", `sidebar-group-${groupName.toLowerCase().replaceAll(/\s+/g, "-")}`);

  const groupLabel = document.createElement("span");
  groupLabel.className = "sidebar-group-label";
  groupLabel.textContent = groupName;

  const groupToggle = document.createElement("span");
  groupToggle.className = "sidebar-group-toggle";
  groupToggle.textContent = "⌃";
  groupToggle.setAttribute("aria-hidden", "true");

  header.append(groupLabel, groupToggle);

  // Toggle collapse state and update ARIA
  header.addEventListener("click", () => {
    const isCollapsed = groupEl.classList.toggle("is-collapsed");
    header.setAttribute("aria-expanded", String(!isCollapsed));
  });

  return header;
}

function extractIssueId(path: string): string | null {
  return /^\/issues\/([^/]+)/.exec(path)?.[1] ?? null;
}

interface ContextualEntry {
  name: string;
  path: string;
  icon: IconName;
}

function buildContextualIssueGroup(issueId: string, onNavigate: () => void): HTMLElement {
  const group = document.createElement("section");
  group.className = "sidebar-group sidebar-group--contextual";
  group.id = "sidebar-group-issue-ctx";

  const header = document.createElement("div");
  header.className = "sidebar-group-header sidebar-group-header--contextual";
  const label = document.createElement("span");
  label.className = "sidebar-group-label";
  label.textContent = issueId;
  header.append(label);
  group.append(header);

  const entries: ContextualEntry[] = [
    { name: "Detail", path: `/issues/${issueId}`, icon: "issueDetail" },
    { name: "Logs", path: `/issues/${issueId}/logs`, icon: "issueLogs" },
    { name: "Runs", path: `/issues/${issueId}/runs`, icon: "issueRuns" },
  ];

  const container = document.createElement("div");
  container.className = "sidebar-group-items";
  const inner = document.createElement("div");
  inner.className = "sidebar-group-items-inner";

  for (const entry of entries) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sidebar-item transition-base";
    btn.dataset.path = entry.path;
    btn.dataset.exact = "true";
    btn.setAttribute("aria-label", entry.name);
    btn.title = entry.name;

    const labelSpan = document.createElement("span");
    labelSpan.className = "sidebar-item-label";
    labelSpan.textContent = entry.name;

    const tooltipSpan = document.createElement("span");
    tooltipSpan.className = "sidebar-item-tooltip";
    tooltipSpan.textContent = entry.name;

    btn.append(createIconSlot(entry.icon, { slotClassName: "sidebar-icon", size: 18 }), labelSpan, tooltipSpan);
    btn.addEventListener("click", () => {
      router.navigate(entry.path);
      onNavigate();
    });
    inner.append(btn);
  }

  container.append(inner);
  group.append(container);
  return group;
}

function updateContextualNav(sidebarEl: HTMLElement, currentPath: string, onNavigate: () => void): void {
  const issueId = extractIssueId(currentPath);

  if (!issueId) {
    _contextualGroupEl?.remove();
    _contextualGroupEl = null;
    return;
  }

  if (_contextualGroupEl?.dataset.issueId === issueId) {
    return;
  }

  _contextualGroupEl?.remove();
  const group = buildContextualIssueGroup(issueId, onNavigate);
  group.dataset.issueId = issueId;

  const firstGroup = sidebarEl.querySelector<HTMLElement>(".sidebar-group:not(.sidebar-group--contextual)");
  if (firstGroup?.nextSibling) {
    sidebarEl.insertBefore(group, firstGroup.nextSibling);
  } else {
    sidebarEl.insertBefore(group, sidebarEl.querySelector(".sidebar-collapse-toggle"));
  }

  _contextualGroupEl = group;
}

function buildCollapseToggle(onToggle: () => void): { toggle: HTMLButtonElement; label: HTMLSpanElement } {
  const toggle = document.createElement("button");
  toggle.className = "sidebar-collapse-toggle";
  toggle.type = "button";

  const icon = document.createElement("span");
  icon.className = "sidebar-collapse-toggle-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.append(createIcon("chevronLeft", { size: 16 }));

  const label = document.createElement("span");
  label.className = "sidebar-collapse-label";
  label.textContent = "Toggle";

  toggle.append(icon, label);

  toggle.addEventListener("click", onToggle);

  return { toggle, label };
}

export function initSidebar(sidebarEl: HTMLElement): void {
  sidebarEl.classList.add("transition-base");
  sidebarEl.replaceChildren();
  sidebarEl.id = "shell-sidebar";

  const parent = sidebarEl.parentElement;
  if (!(parent instanceof HTMLElement)) {
    throw new TypeError("Sidebar parent is required.");
  }

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "shell-sidebar-backdrop";
  backdrop.hidden = true;
  backdrop.setAttribute("aria-label", "Close navigation");
  parent.insertBefore(backdrop, sidebarEl.nextSibling);

  const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);
  let mobileOpen = false;

  function closeMobile(): void {
    if (!mobileQuery.matches || !mobileOpen) {
      return;
    }
    mobileOpen = false;
    syncSidebarState();
  }

  const { toggle, label } = buildCollapseToggle(() => toggleSidebar());

  function dispatchState(): void {
    window.dispatchEvent(
      new CustomEvent("shell:sidebar-state", {
        detail: {
          mobile: mobileQuery.matches,
          mobileOpen,
          expanded: sidebarEl.classList.contains("is-expanded"),
        },
      }),
    );
    backdrop.hidden = !(mobileQuery.matches && mobileOpen);
  }

  function syncToggle(): void {
    if (mobileQuery.matches) {
      toggle.title = mobileOpen ? "Close navigation" : "Open navigation";
      label.textContent = mobileOpen ? "Close" : "Menu";
      return;
    }
    const expanded = sidebarEl.classList.contains("is-expanded");
    toggle.title = expanded ? "Collapse sidebar" : "Expand sidebar";
    label.textContent = expanded ? "Collapse" : "Expand";
  }

  function syncSidebarState(): void {
    sidebarEl.classList.toggle("is-mobile", mobileQuery.matches);
    if (mobileQuery.matches) {
      sidebarEl.classList.add("is-expanded");
      sidebarEl.classList.toggle("is-mobile-open", mobileOpen);
    } else {
      mobileOpen = false;
      sidebarEl.classList.remove("is-mobile-open");
      sidebarEl.classList.toggle("is-expanded", readExpandedPref());
    }
    syncToggle();
    syncBadgeVisibility(sidebarEl);
    dispatchState();
  }

  function toggleSidebar(): void {
    if (mobileQuery.matches) {
      mobileOpen = !mobileOpen;
      syncSidebarState();
      return;
    }
    const expanded = !sidebarEl.classList.contains("is-expanded");
    saveExpandedPref(expanded);
    sidebarEl.classList.toggle("is-expanded", expanded);
    syncSidebarState();
  }

  sidebarEl.classList.toggle("is-expanded", readExpandedPref());

  for (const groupName of navGroups) {
    const group = document.createElement("section");
    group.className = "sidebar-group";
    group.id = `sidebar-group-${groupName.toLowerCase().replaceAll(/\s+/g, "-")}`;

    const header = buildGroupHeader(groupName, group);
    group.append(header);
    buildNavItems(group, groupName, closeMobile);
    sidebarEl.append(group);
  }

  sidebarEl.append(toggle);
  backdrop.addEventListener("click", closeMobile);

  if (_toggleHandler) window.removeEventListener("shell:toggle-sidebar", _toggleHandler);
  _toggleHandler = toggleSidebar;
  window.addEventListener("shell:toggle-sidebar", _toggleHandler);

  if (_mobileHandler && _cachedMobileQuery) _cachedMobileQuery.removeEventListener("change", _mobileHandler);
  _mobileHandler = syncSidebarState;
  _cachedMobileQuery = mobileQuery;
  mobileQuery.addEventListener("change", _mobileHandler);

  void loadBadgeCounts(sidebarEl);

  updateActiveState(sidebarEl);
  updateContextualNav(sidebarEl, window.location.pathname, closeMobile);
  if (_navHandler) window.removeEventListener("router:navigate", _navHandler);
  _navHandler = () => {
    updateActiveState(sidebarEl);
    updateContextualNav(sidebarEl, window.location.pathname, closeMobile);
    closeMobile();
  };
  window.addEventListener("router:navigate", _navHandler);
  syncSidebarState();
}
