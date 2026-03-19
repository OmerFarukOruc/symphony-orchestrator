const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  retrying: "Retrying",
  blocked: "Blocked",
  completed: "Done",
  queued: "Queued",
  claimed: "Claimed",
  pending_change: "Model Change",
};

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, "_");
}

export function statusChip(status: string): HTMLElement {
  const normalized = normalizeStatus(status);
  const chip = document.createElement("span");
  chip.className = `status-chip status-${normalized}`;

  const dot = document.createElement("span");
  dot.className = "status-chip-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.textContent = "◉";

  const label = document.createElement("span");
  label.textContent = STATUS_LABELS[normalized] ?? "Unknown";

  chip.append(dot, label);
  return chip;
}
