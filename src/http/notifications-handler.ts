import type { Request, Response } from "express";

import type { NotificationStorePort } from "../persistence/sqlite/notification-store.js";

interface NotificationHandlerDeps {
  notificationStore?: NotificationStorePort;
}

function parseLimit(value: unknown): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") {
    return null;
  }
  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function resolveUnreadOnly(value: unknown): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "true" || candidate === "1";
}

function getSingleParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export async function handleListNotifications(
  deps: NotificationHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  if (!deps.notificationStore) {
    response.status(503).json({ error: { code: "not_configured", message: "notification store not available" } });
    return;
  }

  const limit = parseLimit(request.query.limit);
  if (request.query.limit !== undefined && limit === null) {
    response.status(400).json({
      error: {
        code: "validation_error",
        message: "limit must be a positive integer",
      },
    });
    return;
  }

  const unreadOnly = resolveUnreadOnly(request.query.unread);
  const [notifications, unreadCount, totalCount] = await Promise.all([
    deps.notificationStore.list({ limit: limit ?? undefined, unreadOnly }),
    deps.notificationStore.countUnread(),
    deps.notificationStore.countAll(),
  ]);

  response.json({
    notifications,
    unreadCount,
    totalCount,
  });
}

export async function handleMarkNotificationRead(
  deps: NotificationHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  if (!deps.notificationStore) {
    response.status(503).json({ error: { code: "not_configured", message: "notification store not available" } });
    return;
  }

  const notificationId = getSingleParam(request.params.notification_id);
  if (!notificationId) {
    response.status(400).json({ error: { code: "validation_error", message: "notification_id is required" } });
    return;
  }

  const notification = await deps.notificationStore.markRead(notificationId);
  if (!notification) {
    response.status(404).json({ error: { code: "not_found", message: "notification not found" } });
    return;
  }

  response.json({
    ok: true,
    notification,
    unreadCount: await deps.notificationStore.countUnread(),
  });
}

export async function handleMarkAllNotificationsRead(
  deps: NotificationHandlerDeps,
  _request: Request,
  response: Response,
): Promise<void> {
  if (!deps.notificationStore) {
    response.status(503).json({ error: { code: "not_configured", message: "notification store not available" } });
    return;
  }

  const result = await deps.notificationStore.markAllRead();
  response.json({
    ok: true,
    updatedCount: result.updatedCount,
    unreadCount: result.unreadCount,
  });
}
