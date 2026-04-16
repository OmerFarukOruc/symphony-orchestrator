const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  stopping: "Stopping…",
  retrying: "Retrying",
  blocked: "Blocked",
  completed: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
  queued: "Queued",
  claimed: "Claimed",
  pending_change: "Model Change",
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replaceAll(/\s+/g, "_");
}

function capitalizeStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function statusChip(status: string): HTMLElement {
  const normalized = normalizeStatus(status);
  const chip = document.createElement("span");
  chip.className = `mc-status-chip status-${normalized}`;

  const dot = document.createElement("span");
  dot.className = "mc-status-chip-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.textContent = "◉";

  const label = document.createElement("span");
  label.textContent = STATUS_LABELS[normalized] ?? capitalizeStatus(normalized);

  chip.append(dot, label);
  return chip;
}

/**
 * Canonical bare status-indicator dot. Takes a base class so callers can keep
 * their page-scoped styling (obs-dot, git-status-dot) while sharing the
 * underlying primitive. Replaces the duplicate local implementations in
 * observability-sections.ts and git-view.ts.
 */
export function statusDot(status: string, baseClass = "mc-status-dot"): HTMLElement {
  const normalized = normalizeStatus(status);
  const dot = document.createElement("span");
  dot.className = `${baseClass} is-${normalized}`;
  dot.setAttribute("aria-hidden", "true");
  return dot;
}
