import { api } from "../api";
import { createIcon } from "./icons";
import { toggleTheme } from "./theme";
import { toast } from "./toast";

function createZoneSeparator(): HTMLElement {
  const separator = document.createElement("div");
  separator.className = "header-zone-separator";
  return separator;
}

export function initHeader(headerEl: HTMLElement): void {
  headerEl.replaceChildren();

  const navButton = document.createElement("button");
  navButton.type = "button";
  navButton.className = "mc-button is-ghost is-icon-only header-action-btn shell-nav-toggle";
  navButton.title = "Open navigation";
  navButton.hidden = true;
  navButton.setAttribute("aria-controls", "shell-sidebar");
  navButton.setAttribute("aria-expanded", "false");
  navButton.setAttribute("aria-label", "Open navigation");
  navButton.append(createIcon("menu", { size: 18 }));
  navButton.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("shell:toggle-sidebar"));
  });

  window.addEventListener("shell:sidebar-state", (event) => {
    const detail = (event as CustomEvent<{ mobile: boolean; mobileOpen: boolean }>).detail;
    navButton.hidden = !detail.mobile;
    navButton.classList.toggle("is-active", detail.mobileOpen);
    navButton.title = detail.mobileOpen ? "Close navigation" : "Open navigation";
    navButton.setAttribute("aria-label", detail.mobileOpen ? "Close navigation" : "Open navigation");
    navButton.setAttribute("aria-expanded", String(detail.mobileOpen));
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

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "mc-button is-ghost is-icon-only header-action-btn";
  refreshButton.title = "Refresh";
  refreshButton.setAttribute("aria-label", "Refresh orchestrator state");
  refreshButton.append(createIcon("refresh", { size: 16 }));

  const themeButton = document.createElement("button");
  themeButton.type = "button";
  themeButton.className = "mc-button is-ghost is-icon-only header-action-btn";
  themeButton.title = "Theme";
  themeButton.setAttribute("aria-label", "Toggle color theme");
  themeButton.append(createIcon("theme", { size: 16 }));

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

  themeButton.addEventListener("click", () => {
    const next = toggleTheme();
    toast(`Theme: ${next}`, "info");
  });

  actions.append(refreshButton, themeButton);
  headerEl.append(navButton, brand, createZoneSeparator(), command, createZoneSeparator(), actions);
}
