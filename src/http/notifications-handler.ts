import type { Request, Response } from "express";

import type { ConfigStore } from "../config/store.js";
import type { NotificationChannel } from "../notification/channel.js";
import type { RisolutoLogger } from "../core/types.js";
import type { NotificationStorePort } from "../notification/port.js";
import type { AlertHistoryStorePort } from "../alerts/history-store.js";
import { NotificationCenter } from "../notification/notification-center.js";
import { parseLimit, getSingleParam } from "./query-params.js";

interface NotificationHandlerDeps {
  notificationStore?: NotificationStorePort;
  alertHistoryStore?: AlertHistoryStorePort;
  notificationCenter?: Pick<
    NotificationCenter,
    "listNotifications" | "markNotificationRead" | "markAllNotificationsRead" | "listAlertHistory" | "sendSlackTest"
  >;
}

interface NotificationTestDeps {
  configStore?: ConfigStore;
  logger?: RisolutoLogger;
  notificationCenter?: Pick<NotificationCenter, "sendSlackTest">;
  /** Optional DI seam for unit tests — builds the channel used to dispatch the test event. */
  createSlackChannel?: (opts: { webhookUrl: string; logger?: RisolutoLogger }) => NotificationChannel;
}

function resolveUnreadOnly(value: unknown): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "true" || candidate === "1";
}

interface NotificationCenterDepsLike {
  notificationStore?: NotificationStorePort;
  alertHistoryStore?: AlertHistoryStorePort;
  configStore?: ConfigStore;
  logger?: RisolutoLogger;
  createSlackChannel?: (opts: { webhookUrl: string; logger?: RisolutoLogger }) => NotificationChannel;
}

function createNotificationCenter(deps: NotificationCenterDepsLike): NotificationCenter {
  return new NotificationCenter({
    notificationStore: deps.notificationStore,
    alertHistoryStore: deps.alertHistoryStore,
    configStore: deps.configStore,
    logger: deps.logger,
    createSlackChannel: deps.createSlackChannel,
  });
}

export async function handleListNotifications(
  deps: NotificationHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
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
  const center = deps.notificationCenter ?? createNotificationCenter(deps);
  const result = await center.listNotifications({ limit: limit ?? undefined, unreadOnly });
  response.status(result.status).json(result.body);
}

export async function handleMarkNotificationRead(
  deps: NotificationHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  const notificationId = getSingleParam(request.params.notification_id);
  if (!notificationId) {
    response.status(400).json({ error: { code: "validation_error", message: "notification_id is required" } });
    return;
  }

  const center = deps.notificationCenter ?? createNotificationCenter(deps);
  const result = await center.markNotificationRead(notificationId);
  response.status(result.status).json(result.body);
}

export async function handleMarkAllNotificationsRead(
  deps: NotificationHandlerDeps,
  _request: Request,
  response: Response,
): Promise<void> {
  const center = deps.notificationCenter ?? createNotificationCenter(deps);
  const result = await center.markAllNotificationsRead();
  response.status(result.status).json(result.body);
}

export async function handleTestSlackNotification(
  deps: NotificationTestDeps,
  _request: Request,
  response: Response,
): Promise<void> {
  const center = deps.notificationCenter ?? createNotificationCenter(deps);
  const result = await center.sendSlackTest();
  response.status(result.status).json(result.body);
}
