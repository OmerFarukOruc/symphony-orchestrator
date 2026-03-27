import { api } from "../api";
import { createIcon } from "./icons";
import { toggleTheme } from "./theme";
import { toast } from "./toast";
import { createIconButton } from "./buttons.js";

const MOBILE_BREAKPOINT = "(max-width: 760px)";

type SidebarStateDetail = {
  mobile: boolean;
  mobileOpen: boolean;
};

export function getHeaderNavButtonState(detail: SidebarStateDetail): {
  visible: boolean;
  title: string;
  ariaExpanded: string;
} {
  return {
    visible: detail.mobile,
    title: detail.mobileOpen ? "Close navigation" : "Open navigation",
    ariaExpanded: String(detail.mobileOpen),
  };
}

function createZoneSeparator(): HTMLElement {
  const separator = document.createElement("div");
  separator.className = "header-zone-separator";
  return separator;
}

function syncHeaderNavButton(headerEl: HTMLElement, navButton: HTMLButtonElement, detail: SidebarStateDetail): void {
  const state = getHeaderNavButtonState(detail);
  navButton.classList.toggle("is-active", detail.mobileOpen);
  navButton.title = state.title;
  navButton.setAttribute("aria-label", state.title);
  navButton.setAttribute("aria-expanded", state.ariaExpanded);

  if (state.visible) {
    if (navButton.parentElement !== headerEl) {
      headerEl.prepend(navButton);
    }
    return;
  }

  navButton.remove();
}

export function initHeader(headerEl: HTMLElement): void {
  headerEl.replaceChildren();

  const navButton = createIconButton({
    iconName: "menu",
    label: "Open navigation",
    iconSize: 18,
    className: ["header-action-btn", "shell-nav-toggle"],
  });
  navButton.setAttribute("aria-controls", "shell-sidebar");
  navButton.setAttribute("aria-expanded", "false");
  navButton.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("shell:toggle-sidebar"));
  });

  window.addEventListener("shell:sidebar-state", (event) => {
    const detail = (event as CustomEvent<SidebarStateDetail>).detail;
    syncHeaderNavButton(headerEl, navButton, detail);
  });

  const brand = document.createElement("div");
  brand.className = "header-brand";
  const brandIcon = document.createElement("span");
  brandIcon.className = "header-brand-icon";
  brandIcon.append(createIcon("planner", { size: 20 }));
  const titleSpan = document.createElement("span");
  titleSpan.className = "header-brand-name";
  titleSpan.textContent = "Symphony";
  const badgeSpan = document.createElement("span");
  badgeSpan.className = "mc-badge header-env-badge";
  const dot = document.createElement("span");
  dot.className = "status-dot status-dot--local";
  dot.textContent = "\u25CF";
  const envLabel = document.createElement("span");
  envLabel.className = "header-env-label";
  envLabel.textContent = "Local";
  badgeSpan.append(dot, envLabel);
  badgeSpan.title =
    "Local mode — Symphony is running on your machine. Issues are processed in sandboxed Docker containers for security.";
  brand.append(brandIcon, titleSpan, badgeSpan);

  const command = document.createElement("div");
  command.className = "header-command";
  const commandButton = document.createElement("button");
  commandButton.type = "button";
  commandButton.className = "mc-button is-command header-command-trigger";
  const searchIcon = document.createElement("span");
  searchIcon.className = "mc-button-icon header-command-icon";
  searchIcon.append(createIcon("overview", { size: 14 }));
  const cmdLabel = document.createElement("span");
  cmdLabel.className = "header-command-label";
  cmdLabel.textContent = "Search routes, issues, actions\u2026";
  const cmdHint = document.createElement("span");
  cmdHint.className = "mc-button-hint header-command-hint";
  cmdHint.textContent = "Ctrl+K";
  commandButton.append(searchIcon, cmdLabel, cmdHint);
  commandButton.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("palette:open"));
  });
  command.append(commandButton);

  const actions = document.createElement("div");
  actions.className = "header-actions";

  const refreshButton = createIconButton({
    iconName: "refresh",
    label: "Refresh orchestrator state",
    className: "header-action-btn",
  });

  const themeButton = createIconButton({
    iconName: "theme",
    label: "Toggle color theme",
    className: "header-action-btn",
  });

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.classList.add("is-disabled");
    refreshButton.classList.add("is-busy");
    try {
      await api.postRefresh();
      toast("Refresh queued.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Refresh failed.", "error");
    }
    window.setTimeout(() => {
      refreshButton.disabled = false;
      refreshButton.classList.remove("is-disabled");
      refreshButton.classList.remove("is-busy");
    }, 500);
  });

  const apiDocsButton = createIconButton({
    iconName: "issueDetail",
    label: "API documentation",
    className: "header-action-btn",
  });
  apiDocsButton.addEventListener("click", () => {
    window.open("/api/docs", "_blank", "noopener");
  });

  themeButton.addEventListener("click", () => {
    const next = toggleTheme();
    toast(`Theme: ${next}`, "info");
  });

  actions.append(refreshButton, apiDocsButton, themeButton);
  headerEl.append(brand, createZoneSeparator(), command, createZoneSeparator(), actions);
  syncHeaderNavButton(headerEl, navButton, {
    mobile: window.matchMedia(MOBILE_BREAKPOINT).matches,
    mobileOpen: false,
  });
}
