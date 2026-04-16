import type { SystemHealth } from "../types/runtime.js";
import { formatRelativeTime } from "../utils/format.js";

/**
 * Creates a system health badge showing orchestrator health status.
 * Returns an element + an update function for live re-renders.
 */
export function createSystemHealthBadge(): {
  root: HTMLElement;
  update: (health: SystemHealth | undefined) => void;
} {
  const root = document.createElement("div");
  root.className = "system-health-badge";

  const dot = document.createElement("span");
  dot.className = "system-health-dot";
  dot.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "system-health-label";

  const message = document.createElement("span");
  message.className = "system-health-message";

  const checkedAt = document.createElement("time");
  checkedAt.className = "system-health-checked-at text-mono";

  root.append(dot, label, message, checkedAt);

  function update(health: SystemHealth | undefined): void {
    // Remove prior status classes
    root.classList.remove("is-healthy", "is-degraded", "is-critical");

    if (!health) {
      root.classList.add("is-healthy");
      label.textContent = "healthy";
      message.textContent = "Awaiting first health check…";
      checkedAt.textContent = "";
      checkedAt.dateTime = "";
      return;
    }

    root.classList.add(`is-${health.status}`);
    label.textContent = health.status;
    message.textContent = health.message;
    checkedAt.textContent = formatRelativeTime(health.checked_at);
    checkedAt.dateTime = health.checked_at;
    checkedAt.title = health.checked_at;
  }

  return { root, update };
}
