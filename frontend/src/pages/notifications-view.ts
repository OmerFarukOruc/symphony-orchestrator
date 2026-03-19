import { api } from "../api";
import { createEmptyState } from "../components/empty-state";

interface Notification {
  id: string;
  title: string;
  detail: string;
  channel: string;
  timestamp: string;
  read: boolean;
  delivery_status: string;
  issue_identifier?: string;
}

export function buildNotificationsPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "notifications-page page fade-in";

  const heading = document.createElement("h1");
  heading.className = "page-title";
  heading.textContent = "Notifications";

  const subtitle = document.createElement("p");
  subtitle.className = "page-subtitle";
  subtitle.textContent = "Webhook deliveries, system alerts, and operator notifications in one timeline.";

  const timeline = document.createElement("div");
  timeline.className = "notifications-timeline";

  page.append(heading, subtitle, timeline);
  loadNotifications(timeline);
  return page;
}

async function loadNotifications(container: HTMLElement): Promise<void> {
  try {
    const data = await api.getNotifications();
    if (data.notifications.length === 0) {
      container.append(
        createEmptyState(
          "No notifications",
          "Notifications will appear here when webhooks fire or system alerts trigger.",
        ),
      );
      return;
    }
    for (const item of data.notifications) {
      container.append(buildNotificationRow(item));
    }
  } catch {
    container.append(
      createEmptyState(
        "No notifications",
        "Notifications will appear here when webhooks fire or system alerts trigger.",
      ),
    );
  }
}

function buildNotificationRow(item: Notification): HTMLElement {
  const row = document.createElement("div");
  row.className = `notification-row${item.read ? "" : " is-unread"}`;
  row.innerHTML = `
    <div class="notification-icon">
      <div class="notification-dot${item.read ? "" : " is-unread"}"></div>
    </div>
    <div class="notification-content">
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.detail)}</p>
    </div>
    <div class="notification-meta">
      <span>${formatTime(item.timestamp)}</span>
      <span class="notification-delivery-badge is-${item.delivery_status}">${item.delivery_status}</span>
    </div>
  `;
  return row;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return timestamp;
  }
}
