import { api } from "../api";
import { toggleTheme } from "./theme";
import { toast } from "./toast";

function button(label: string, icon: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "header-button transition-base";
  const iconSpan = document.createElement("span");
  iconSpan.textContent = icon;
  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;
  element.append(iconSpan, labelSpan);
  return element;
}

export function initHeader(headerEl: HTMLElement): void {
  headerEl.replaceChildren();

  const brand = document.createElement("div");
  brand.className = "header-brand";
  const titleSpan = document.createElement("span");
  titleSpan.className = "header-title";
  titleSpan.textContent = "Symphony";
  const badgeSpan = document.createElement("span");
  badgeSpan.className = "header-badge";
  const dot = document.createElement("span");
  dot.className = "header-badge-dot";
  dot.textContent = "●";
  badgeSpan.append(dot, " local");
  brand.append(titleSpan, badgeSpan);

  const command = document.createElement("div");
  command.className = "header-command";
  const commandButton = document.createElement("button");
  commandButton.type = "button";
  commandButton.className = "command-button transition-base";
  const cmdLabel = document.createElement("span");
  cmdLabel.textContent = "Search routes, issues, actions…";
  const cmdHint = document.createElement("span");
  cmdHint.className = "header-hint";
  cmdHint.textContent = "Ctrl+K";
  commandButton.append(cmdLabel, cmdHint);
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
    refreshButton.replaceChildren();
    const spinIcon = document.createElement("span");
    spinIcon.textContent = "⟳";
    const spinLabel = document.createElement("span");
    spinLabel.textContent = "Refreshing";
    refreshButton.append(spinIcon, spinLabel);
    try {
      await api.postRefresh();
      toast("Refresh queued.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Refresh failed.", "error");
    }
    window.setTimeout(() => {
      refreshButton.disabled = false;
      refreshButton.replaceChildren();
      const restoreIcon = document.createElement("span");
      restoreIcon.textContent = "↻";
      const restoreLabel = document.createElement("span");
      restoreLabel.textContent = "Refresh";
      refreshButton.append(restoreIcon, restoreLabel);
    }, 500);
  });

  themeButton.addEventListener("click", () => {
    const next = toggleTheme();
    toast(`Theme: ${next}`, "info");
  });

  actions.append(refreshButton, themeButton, hint);
  headerEl.append(brand, command, actions);
}
