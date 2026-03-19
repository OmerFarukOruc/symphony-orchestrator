import { api } from "../api";
import { toggleTheme } from "./theme";
import { toast } from "./toast";

function button(label: string, icon: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "header-button transition-base";
  element.innerHTML = `<span>${icon}</span><span>${label}</span>`;
  return element;
}

export function initHeader(headerEl: HTMLElement): void {
  headerEl.innerHTML = "";

  const brand = document.createElement("div");
  brand.className = "header-brand";
  brand.innerHTML = `<span class="header-title">Symphony</span><span class="header-badge"><span class="header-badge-dot">●</span> local</span>`;

  const command = document.createElement("div");
  command.className = "header-command";
  const commandButton = document.createElement("button");
  commandButton.type = "button";
  commandButton.className = "command-button transition-base";
  commandButton.innerHTML = `<span>Search routes, issues, actions…</span><span class="header-hint">Ctrl+K</span>`;
  commandButton.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("palette:open"));
  });
  command.append(commandButton);

  const actions = document.createElement("div");
  actions.className = "header-actions";
  const refreshButton = button("Refresh", "↻");
  const themeButton = button("Theme", "◐");
  const hint = document.createElement("span");
  hint.className = "header-hint";
  hint.textContent = "⌘K";

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.innerHTML = "<span>⟳</span><span>Refreshing</span>";
    try {
      await api.postRefresh();
      toast("Refresh queued.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Refresh failed.", "error");
    }
    window.setTimeout(() => {
      refreshButton.disabled = false;
      refreshButton.innerHTML = "<span>↻</span><span>Refresh</span>";
    }, 500);
  });

  themeButton.addEventListener("click", () => {
    const next = toggleTheme();
    toast(`Theme: ${next}`, "info");
  });

  actions.append(refreshButton, themeButton, hint);
  headerEl.append(brand, command, actions);
}
