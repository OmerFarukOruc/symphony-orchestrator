import { normalizePriority } from "../utils/issues";

export function priorityBadge(priority: string | number | null | undefined): HTMLElement {
  const normalized = normalizePriority(priority);
  const badge = document.createElement("span");
  badge.className = `mc-priority-badge priority-${normalized}`;
  badge.textContent = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return badge;
}
