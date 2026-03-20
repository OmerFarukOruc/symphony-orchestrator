import { api } from "../api";
import { createIcon } from "./icons";
import { toggleTheme } from "./theme";
import { toast } from "./toast";

export function initHeader(headerEl: HTMLElement): void {
  headerEl.replaceChildren();

  const brand = document.createElement("div");
  brand.className = "header-brand";
  const titleSpan = document.createElement("span");
  titleSpan.textContent = "Symphony";
  const sep = document.createElement("span");
  sep.className = "header-separator";
  sep.textContent = "·";
  const badgeSpan = document.createElement("span");
  badgeSpan.className = "mc-badge header-env-badge";
  const dot = document.createElement("span");
  dot.className = "status-dot";
  dot.textContent = "\u25CF";
  badgeSpan.append(dot, " local");
  brand.append(titleSpan, sep, badgeSpan);

  const command = document.createElement("div");
  command.className = "header-command";
  const commandButton = document.createElement("button");
  commandButton.type = "button";
  commandButton.className = "header-command-trigger";
  const cmdLabel = document.createElement("span");
  cmdLabel.textContent = "Search routes, issues, actions\u2026";
  const cmdHint = document.createElement("span");
  cmdHint.className = "header-command-hint";
  cmdHint.textContent = "Ctrl+K";
  commandButton.append(cmdLabel, cmdHint);
  commandButton.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("palette:open"));
  });
  command.append(commandButton);

  const actions = document.createElement("div");
  actions.className = "header-actions";

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "header-action-btn";
  refreshButton.title = "Refresh";
  refreshButton.append(createIcon("refresh", { size: 16 }));

  const themeButton = document.createElement("button");
  themeButton.type = "button";
  themeButton.className = "header-action-btn";
  themeButton.title = "Theme";
  themeButton.append(createIcon("theme", { size: 16 }));

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.classList.add("is-disabled");
    try {
      await api.postRefresh();
      toast("Refresh queued.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Refresh failed.", "error");
    }
    window.setTimeout(() => {
      refreshButton.disabled = false;
      refreshButton.classList.remove("is-disabled");
    }, 500);
  });

  themeButton.addEventListener("click", () => {
    const next = toggleTheme();
    toast(`Theme: ${next}`, "info");
  });

  actions.append(refreshButton, themeButton);
  headerEl.append(brand, command, actions);
}
