import type { WebhookHealth } from "../types";
import { formatRelativeTime } from "../utils/format";

/**
 * Creates a compact webhook health panel showing Linear webhook status.
 * Returns an element + an update function for live re-renders.
 * The panel is hidden when `health` is `undefined` (feature not configured).
 */
export function createWebhookHealthPanel(): {
  root: HTMLElement;
  update: (health: WebhookHealth | undefined) => void;
} {
  const root = document.createElement("div");
  root.className = "webhook-health-panel";
  root.dataset.testid = "webhook-health-panel";
  root.hidden = true;

  // Status row: dot + label
  const statusRow = document.createElement("div");
  statusRow.className = "webhook-health-status-row";

  const dot = document.createElement("span");
  dot.className = "webhook-health-dot";
  dot.setAttribute("aria-hidden", "true");

  const statusLabel = document.createElement("span");
  statusLabel.className = "webhook-health-status-label";
  statusLabel.dataset.testid = "webhook-status";

  statusRow.append(dot, statusLabel);

  // Details grid
  const detailsGrid = document.createElement("div");
  detailsGrid.className = "webhook-health-details";

  const lastEvent = createDetailItem("Last event", "webhook-last-event");
  const interval = createDetailItem("Poll interval", "webhook-interval");
  const deliveries = createDetailItem("Deliveries", "webhook-deliveries");

  detailsGrid.append(lastEvent.root, interval.root, deliveries.root);

  root.append(statusRow, detailsGrid);

  function update(health: WebhookHealth | undefined): void {
    if (!health) {
      root.hidden = true;
      return;
    }

    root.hidden = false;

    // Status classes
    root.classList.remove("is-connected", "is-degraded", "is-disconnected");
    root.classList.add(`is-${health.status}`);

    statusLabel.textContent = health.status.charAt(0).toUpperCase() + health.status.slice(1);

    // Last event: type + relative time
    if (health.last_delivery_at) {
      const eventType = health.last_event_type ?? "Unknown";
      const relative = formatRelativeTime(health.last_delivery_at);
      lastEvent.value.textContent = `${eventType} \u00B7 ${relative}`;
    } else {
      lastEvent.value.textContent = "No events yet";
    }

    // Polling interval
    const intervalSeconds = Math.round(health.effective_interval_ms / 1000);
    interval.value.textContent = `${intervalSeconds}s`;

    // Delivery count
    deliveries.value.textContent = String(health.stats.deliveries_received);
  }

  return { root, update };
}

/** Creates a label + value pair for the details grid. */
function createDetailItem(label: string, testId: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement("div");
  root.className = "webhook-health-detail";

  const labelEl = document.createElement("span");
  labelEl.className = "webhook-health-detail-label";
  labelEl.textContent = label;

  const value = document.createElement("span");
  value.className = "webhook-health-detail-value";
  value.dataset.testid = testId;

  root.append(labelEl, value);
  return { root, value };
}
