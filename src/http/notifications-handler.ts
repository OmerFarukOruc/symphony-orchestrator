import type { Request, Response } from "express";

import type { ConfigStore } from "../config/store.js";
import type { NotificationChannel, NotificationEvent } from "../notification/channel.js";
import { SlackWebhookChannel } from "../notification/slack-webhook.js";
import type { RisolutoLogger } from "../core/types.js";
import type { NotificationStorePort } from "../persistence/sqlite/notification-store.js";
import { toErrorString } from "../utils/type-guards.js";
import { parseLimit, getSingleParam } from "./query-params.js";

interface NotificationHandlerDeps {
  notificationStore?: NotificationStorePort;
}

interface NotificationTestDeps {
  configStore?: ConfigStore;
  logger?: RisolutoLogger;
  /** Optional DI seam for unit tests — builds the channel used to dispatch the test event. */
  createSlackChannel?: (opts: { webhookUrl: string; logger?: RisolutoLogger }) => NotificationChannel;
}

function resolveUnreadOnly(value: unknown): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "true" || candidate === "1";
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

interface SlackErrorMapping {
  status: number;
  code: string;
  message: string;
}

function mapSlackError(error: unknown): SlackErrorMapping {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      status: 504,
      code: "timeout",
      message: "Slack webhook did not respond in 10s. Check the URL or your network, then try again.",
    };
  }
  const rawMessage = error instanceof Error ? error.message : toErrorString(error);
  const statusMatch = /failed with status (\d{3})/.exec(rawMessage);
  const upstreamStatus = statusMatch ? Number.parseInt(statusMatch[1] ?? "", 10) : null;
  if (upstreamStatus === 404) {
    return {
      status: 404,
      code: "webhook_invalid",
      message: "Slack rejected the webhook URL (404). Re-create the Incoming Webhook in Slack and paste the new URL.",
    };
  }
  if (upstreamStatus === 403) {
    return {
      status: 403,
      code: "webhook_forbidden",
      message: "Slack refused the webhook (403). The app or channel may no longer be authorized.",
    };
  }
  if (upstreamStatus === 429) {
    return {
      status: 429,
      code: "rate_limited",
      message: "Slack rate limited the request (429). Wait a moment and try again.",
    };
  }
  if (upstreamStatus !== null) {
    return {
      status: 502,
      code: "upstream_error",
      message: `Slack returned an error (${upstreamStatus}). ${rawMessage}`,
    };
  }
  return {
    status: 500,
    code: "internal_error",
    message: rawMessage || "Unknown error while sending test notification.",
  };
}

function buildTestEvent(): NotificationEvent {
  const timestamp = new Date().toISOString();
  return {
    type: "worker_completed",
    severity: "info",
    timestamp,
    title: "Risoluto Slack test",
    message:
      "This is a test notification from your Risoluto settings page. If you see this in Slack, the webhook is working.",
    issue: {
      id: null,
      identifier: "RIS-TEST",
      title: "Settings connectivity test",
      state: "test",
      url: null,
    },
    attempt: null,
    metadata: {
      source: "settings-test",
      sent_at: timestamp,
    },
  };
}

export async function handleTestSlackNotification(
  deps: NotificationTestDeps,
  _request: Request,
  response: Response,
): Promise<void> {
  if (!deps.configStore) {
    response.status(503).json({
      error: { code: "not_configured", message: "config store not available" },
    });
    return;
  }

  const channels = deps.configStore.getConfig().notifications?.channels ?? [];
  const slackChannel = channels.find((ch) => ch.type === "slack" && ch.enabled !== false);
  if (!slackChannel || slackChannel.type !== "slack" || !slackChannel.webhookUrl) {
    response.status(400).json({
      error: {
        code: "slack_not_configured",
        message: "Save a Slack webhook URL first, then try again.",
      },
    });
    return;
  }

  const channel = deps.createSlackChannel
    ? deps.createSlackChannel({ webhookUrl: slackChannel.webhookUrl, logger: deps.logger })
    : // Override verbosity to "verbose" so the test fires even when the saved config is "off".
      new SlackWebhookChannel({
        name: "slack_webhook_test",
        webhookUrl: slackChannel.webhookUrl,
        verbosity: "verbose",
        minSeverity: "info",
        logger: deps.logger,
      });

  const event = buildTestEvent();
  try {
    await channel.notify(event);
    response.status(200).json({ ok: true, sentAt: event.timestamp });
  } catch (error) {
    const mapping = mapSlackError(error);
    response.status(mapping.status).json({
      error: {
        code: mapping.code,
        message: mapping.message,
      },
    });
  }
}
