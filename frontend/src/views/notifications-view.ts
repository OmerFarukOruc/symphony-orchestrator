import { api } from "../api.js";
import { createEmptyState } from "../components/empty-state.js";
import { createPageHeader } from "../components/page-header.js";
import { subscribeNotificationUpdates } from "../state/event-source.js";
import { router } from "../router.js";
import { buttonClassName } from "../ui/buttons.js";
import { skeletonBlock, skeletonLine } from "../ui/skeleton.js";
import type {
  NotificationDeliverySummary,
  NotificationReadResponse,
  NotificationRecord,
  NotificationsListResponse,
  NotificationsReadAllResponse,
} from "../types.js";
import { flashDiff } from "../utils/diff.js";
import { el } from "../utils/dom.js";
import { formatCompactNumber, formatCompactTimestamp, formatRelativeTime } from "../utils/format.js";
import { registerPageCleanup } from "../utils/page.js";

type NotificationFilter = "all" | "unread";

export function createNotificationsPage(): HTMLElement {
  const page = el("div", "page notifications-page fade-in");

  const refreshButton = el("button", buttonClassName({ tone: "ghost", size: "sm" }), "Refresh");
  refreshButton.type = "button";
  const markAllButton = el("button", buttonClassName({ tone: "primary", size: "sm" }), "Mark all read");
  markAllButton.type = "button";

  const header = createPageHeader(
    "Notifications",
    "Webhook deliveries, system alerts, and operator notifications in one timeline.",
    { actions: [refreshButton, markAllButton] },
  );

  const body = el("section", "page-body notifications-page-body");
  body.append(buildLoadingSkeleton());

  page.append(header, body);

  let snapshot: NotificationsListResponse | null = null;
  let filter: NotificationFilter = "all";
  let isLoading = false;
  let queuedRefresh = false;

  const loadNotifications = async (): Promise<void> => {
    if (isLoading) {
      queuedRefresh = true;
      return;
    }
    isLoading = true;
    refreshButton.toggleAttribute("disabled", true);
    try {
      snapshot = await api.getNotifications({ limit: 100, unread: filter === "unread" });
      renderPage(body, snapshot, filter, {
        onFilterChange(nextFilter) {
          filter = nextFilter;
          void loadNotifications();
        },
        onMarkRead(id) {
          void markNotificationRead(id);
        },
        onMarkAllRead() {
          void markAllNotificationsRead();
        },
      });
      markAllButton.toggleAttribute("disabled", snapshot.unreadCount === 0);
      flashDiff(body);
    } catch {
      snapshot = null;
      body.replaceChildren(renderErrorState());
      markAllButton.toggleAttribute("disabled", true);
    } finally {
      refreshButton.toggleAttribute("disabled", false);
      isLoading = false;
      if (queuedRefresh) {
        queuedRefresh = false;
        void loadNotifications();
      }
    }
  };

  const markNotificationRead = async (id: string): Promise<void> => {
    try {
      const result = await api.postNotificationRead(id);
      snapshot = applyReadResult(snapshot, result, filter);
      if (snapshot) {
        renderPage(body, snapshot, filter, {
          onFilterChange(nextFilter) {
            filter = nextFilter;
            void loadNotifications();
          },
          onMarkRead(nextId) {
            void markNotificationRead(nextId);
          },
          onMarkAllRead() {
            void markAllNotificationsRead();
          },
        });
      }
      markAllButton.toggleAttribute("disabled", (snapshot?.unreadCount ?? 0) === 0);
    } catch {
      void loadNotifications();
    }
  };

  const markAllNotificationsRead = async (): Promise<void> => {
    try {
      const result = await api.postNotificationsReadAll();
      snapshot = applyReadAllResult(snapshot, result, filter);
      if (snapshot) {
        renderPage(body, snapshot, filter, {
          onFilterChange(nextFilter) {
            filter = nextFilter;
            void loadNotifications();
          },
          onMarkRead(id) {
            void markNotificationRead(id);
          },
          onMarkAllRead() {
            void markAllNotificationsRead();
          },
        });
      }
      markAllButton.toggleAttribute("disabled", true);
    } catch {
      void loadNotifications();
    }
  };

  refreshButton.addEventListener("click", () => {
    void loadNotifications();
  });
  markAllButton.addEventListener("click", () => {
    void markAllNotificationsRead();
  });

  void loadNotifications();

  const unsubscribeNotifications = subscribeNotificationUpdates(() => {
    void loadNotifications();
  });
  const onStateUpdate = (): void => {
    void loadNotifications();
  };
  window.addEventListener("state:update", onStateUpdate);
  registerPageCleanup(page, () => {
    unsubscribeNotifications();
    window.removeEventListener("state:update", onStateUpdate);
  });

  return page;
}

function buildLoadingSkeleton(): HTMLElement {
  const shell = el("div", "notifications-loading");
  const statsRow = el("div", "notifications-stats-row");
  Array.from({ length: 4 }).forEach(() => {
    const card = el("div", "mc-stat-card");
    card.append(skeletonLine("44%"), skeletonLine("34%"));
    statsRow.append(card);
  });

  const list = el("div", "notifications-list");
  Array.from({ length: 4 }).forEach(() => {
    const row = el("div", "mc-strip notification-row notification-row--skeleton");
    row.append(skeletonLine("28%"), skeletonLine("72%"), skeletonBlock("40px"));
    list.append(row);
  });

  shell.append(statsRow, list);
  return shell;
}

function renderPage(
  body: HTMLElement,
  snapshot: NotificationsListResponse,
  filter: NotificationFilter,
  actions: {
    onFilterChange: (filter: NotificationFilter) => void;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
  },
): void {
  body.replaceChildren();
  body.append(buildStatsRow(snapshot), buildToolbar(snapshot, filter, actions.onFilterChange, actions.onMarkAllRead));

  if (snapshot.notifications.length === 0 && snapshot.totalCount === 0) {
    body.append(renderNoNotificationsState());
    return;
  }

  if (snapshot.notifications.length === 0 && filter === "unread") {
    body.append(renderUnreadEmptyState(actions.onFilterChange));
    return;
  }

  const list = el("section", "notifications-list");
  snapshot.notifications.forEach((notification, index) => {
    const row = buildNotificationRow(notification, index, actions.onMarkRead);
    list.append(row);
  });
  body.append(list);
}

function buildStatsRow(snapshot: NotificationsListResponse): HTMLElement {
  const criticalCount = snapshot.notifications.filter((notification) => notification.severity === "critical").length;
  const quietedCount = snapshot.notifications.filter(
    (notification) => notification.deliverySummary?.skippedDuplicate,
  ).length;
  const row = el("div", "notifications-stats-row");
  row.append(
    buildStatCard("Total", formatCompactNumber(snapshot.totalCount)),
    buildStatCard("Unread", formatCompactNumber(snapshot.unreadCount), snapshot.unreadCount > 0 ? "live" : undefined),
    buildStatCard("Critical", formatCompactNumber(criticalCount), criticalCount > 0 ? "warning" : undefined),
    buildStatCard("Quieted", formatCompactNumber(quietedCount)),
  );
  return row;
}

function buildStatCard(label: string, value: string, accent?: string): HTMLElement {
  const card = el("div", "mc-stat-card" + (accent ? ` is-${accent}` : ""));
  card.append(el("span", "heading-display", value), el("span", "mc-stat-card-label", label));
  return card;
}

function buildToolbar(
  snapshot: NotificationsListResponse,
  filter: NotificationFilter,
  onFilterChange: (filter: NotificationFilter) => void,
  onMarkAllRead: () => void,
): HTMLElement {
  const toolbar = el("section", "mc-toolbar notifications-toolbar");
  const filterGroup = el("div", "notifications-filter-group");
  const summary = el(
    "p",
    "notifications-summary",
    snapshot.unreadCount > 0
      ? `${formatCompactNumber(snapshot.unreadCount)} unread notifications need attention`
      : "Everything is read. New alerts will appear here automatically.",
  );

  for (const candidate of ["all", "unread"] as const satisfies NotificationFilter[]) {
    const button = el("button", `mc-chip is-interactive${filter === candidate ? " is-active" : ""}`);
    button.type = "button";
    button.textContent = candidate === "all" ? "All activity" : "Unread only";
    button.addEventListener("click", () => onFilterChange(candidate));
    filterGroup.append(button);
  }

  const markAllInline = el("button", buttonClassName({ tone: "ghost", size: "sm" }), "Mark all read");
  markAllInline.type = "button";
  markAllInline.toggleAttribute("disabled", snapshot.unreadCount === 0);
  markAllInline.addEventListener("click", onMarkAllRead);

  toolbar.append(summary, filterGroup, markAllInline);
  return toolbar;
}

function buildNotificationRow(
  notification: NotificationRecord,
  index: number,
  onMarkRead: (id: string) => void,
): HTMLElement {
  const row = el(
    "article",
    `mc-strip notification-row ${severityStripClass(notification)}${notification.read ? "" : " is-unread"} stagger-item`,
  );
  row.style.setProperty("--stagger-index", String(index));

  const main = el("div", "notification-row-main");
  const top = el("div", "notification-row-top");
  const labels = el("div", "notification-row-labels");
  labels.append(buildSeverityBadge(notification));
  const issueIdentifier = metadataString(notification.metadata, "issueIdentifier");
  if (issueIdentifier) {
    labels.append(buildMetaChip(issueIdentifier));
  }
  const attemptValue = metadataNumber(notification.metadata, "attempt");
  if (attemptValue !== null) {
    labels.append(buildMetaChip(`Attempt ${attemptValue}`));
  }

  const time = el("div", "notification-row-time");
  time.append(
    el("span", "notification-row-relative", formatRelativeTime(notification.createdAt)),
    el("span", "notification-row-absolute", formatCompactTimestamp(notification.createdAt)),
  );
  top.append(labels, time);

  const title = el("h2", "notification-row-title", notification.title);
  const message = el("p", "notification-row-message", notification.message);
  const footer = el("div", "notification-row-footer");
  const source = el("p", "notification-row-source", describeSource(notification));
  const delivery = el("p", "notification-row-delivery", describeDelivery(notification.deliverySummary));
  footer.append(source, delivery);

  main.append(top, title, message, footer);

  const actions = el("div", "notification-row-actions");
  const issueRoute = metadataString(notification.metadata, "issueIdentifier");
  if (issueRoute) {
    const openIssue = el("button", buttonClassName({ tone: "ghost", size: "sm" }), "Open issue");
    openIssue.type = "button";
    openIssue.addEventListener("click", () => router.navigate(`/queue/${issueRoute}`));
    actions.append(openIssue);
  } else if (notification.href) {
    const openLink = document.createElement("a");
    openLink.className = buttonClassName({ tone: "ghost", size: "sm" });
    openLink.href = notification.href;
    openLink.target = "_blank";
    openLink.rel = "noreferrer";
    openLink.textContent = "Open source";
    actions.append(openLink);
  }

  if (!notification.read) {
    const markRead = el("button", buttonClassName({ tone: "primary", size: "sm" }), "Mark read");
    markRead.type = "button";
    markRead.addEventListener("click", () => onMarkRead(notification.id));
    actions.append(markRead);
  }

  row.append(main, actions);
  return row;
}

function buildSeverityBadge(notification: NotificationRecord): HTMLElement {
  const badge = el(
    "span",
    `mc-chip is-sm ${
      notification.severity === "critical"
        ? "is-status-blocked"
        : notification.severity === "warning"
          ? "is-status-retrying"
          : "is-status-queued"
    }`,
    notification.severity === "critical" ? "Critical" : notification.severity === "warning" ? "Warning" : "Info",
  );
  return badge;
}

function buildMetaChip(label: string): HTMLElement {
  return el("span", "mc-chip is-sm", label);
}

function describeSource(notification: NotificationRecord): string {
  const source = notification.source ?? "Risoluto runtime";
  return notification.read ? `${source} · read` : `${source} · unread`;
}

function describeDelivery(deliverySummary: NotificationDeliverySummary | null): string {
  if (!deliverySummary) {
    return "Dispatching delivery summary…";
  }
  if (deliverySummary.skippedDuplicate) {
    return "Duplicate fanout was suppressed by the dedupe window.";
  }
  const parts: string[] = [];
  if (deliverySummary.deliveredChannels.length > 0) {
    parts.push(`Delivered: ${deliverySummary.deliveredChannels.join(", ")}`);
  }
  if (deliverySummary.failedChannels.length > 0) {
    parts.push(`Failed: ${deliverySummary.failedChannels.map((failure) => failure.channel).join(", ")}`);
  }
  return parts.join(" · ") || "No channels matched this notification.";
}

function renderNoNotificationsState(): HTMLElement {
  return createEmptyState(
    "No notifications yet",
    "Completed runs, retries, failures, alerts, and webhook activity will build a durable timeline here as soon as the system starts emitting them.",
    "Open queue",
    () => router.navigate("/queue"),
    "events",
    {
      headingLevel: "h2",
      secondaryActionLabel: "Open settings",
      secondaryActionHref: "/settings#notifications",
    },
  );
}

function renderUnreadEmptyState(onFilterChange: (filter: NotificationFilter) => void): HTMLElement {
  return createEmptyState(
    "All caught up",
    "There are stored notifications, but nothing unread right now. Switch back to the full timeline to review earlier activity.",
    "Show all activity",
    () => onFilterChange("all"),
    "terminal",
    { headingLevel: "h2" },
  );
}

function renderErrorState(): HTMLElement {
  return createEmptyState(
    "Could not load notifications",
    "Something went wrong loading the notification timeline. Try again, or open Settings if you need to adjust notification channels.",
    "Open notification settings",
    () => router.navigate("/settings#notifications"),
    "error",
    { headingLevel: "h2" },
  );
}

function applyReadResult(
  snapshot: NotificationsListResponse | null,
  result: NotificationReadResponse,
  filter: NotificationFilter,
): NotificationsListResponse | null {
  if (!snapshot) {
    return null;
  }
  const notifications = snapshot.notifications
    .map((notification) => (notification.id === result.notification.id ? result.notification : notification))
    .filter((notification) => filter === "all" || !notification.read);
  return {
    ...snapshot,
    notifications,
    unreadCount: result.unreadCount,
  };
}

function applyReadAllResult(
  snapshot: NotificationsListResponse | null,
  result: NotificationsReadAllResponse,
  filter: NotificationFilter,
): NotificationsListResponse | null {
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    notifications:
      filter === "unread"
        ? []
        : snapshot.notifications.map((notification) => ({
            ...notification,
            read: true,
          })),
    unreadCount: result.unreadCount,
  };
}

function severityStripClass(notification: NotificationRecord): string {
  if (notification.severity === "critical") {
    return " is-status-blocked";
  }
  if (notification.severity === "warning") {
    return " is-status-retrying";
  }
  return " is-status-queued";
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function metadataNumber(metadata: Record<string, unknown> | null, key: string): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
