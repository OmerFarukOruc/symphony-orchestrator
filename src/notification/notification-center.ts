import type { AlertHistoryRecord, AlertHistoryStorePort, ListAlertHistoryOptions } from "../alerts/history-store.js";
import type { ConfigStore } from "../config/store.js";
import type { RisolutoLogger } from "../core/types.js";
import type { NotificationChannel, NotificationEvent } from "./channel.js";
import { SlackWebhookChannel } from "./slack-webhook.js";
import type { ListNotificationsOptions, NotificationStorePort } from "./port.js";
import { toErrorString } from "../utils/type-guards.js";

export interface NotificationCenterOptions {
  notificationStore?: NotificationStorePort;
  alertHistoryStore?: AlertHistoryStorePort;
  configStore?: ConfigStore;
  logger?: RisolutoLogger;
  createSlackChannel?: (opts: { webhookUrl: string; logger?: RisolutoLogger }) => NotificationChannel;
}

export interface NotificationCenterResponse<T> {
  status: number;
  body: T | { error: { code: string; message: string } };
}

export class NotificationCenter {
  constructor(private readonly options: NotificationCenterOptions) {}

  async listNotifications(
    options: ListNotificationsOptions = {},
  ): Promise<NotificationCenterResponse<{ notifications: unknown[]; unreadCount: number; totalCount: number }>> {
    if (!this.options.notificationStore) {
      return unavailable("notification store not available");
    }

    const [notifications, unreadCount, totalCount] = await Promise.all([
      this.options.notificationStore.list(options),
      this.options.notificationStore.countUnread(),
      this.options.notificationStore.countAll(),
    ]);

    return {
      status: 200,
      body: {
        notifications,
        unreadCount,
        totalCount,
      },
    };
  }

  async markNotificationRead(
    notificationId: string,
  ): Promise<NotificationCenterResponse<{ ok: true; notification: unknown; unreadCount: number }>> {
    if (!this.options.notificationStore) {
      return unavailable("notification store not available");
    }

    const notification = await this.options.notificationStore.markRead(notificationId);
    if (!notification) {
      return {
        status: 404,
        body: { error: { code: "not_found", message: "notification not found" } },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        notification,
        unreadCount: await this.options.notificationStore.countUnread(),
      },
    };
  }

  async markAllNotificationsRead(): Promise<
    NotificationCenterResponse<{ ok: true; updatedCount: number; unreadCount: number }>
  > {
    if (!this.options.notificationStore) {
      return unavailable("notification store not available");
    }

    const result = await this.options.notificationStore.markAllRead();
    return {
      status: 200,
      body: {
        ok: true,
        updatedCount: result.updatedCount,
        unreadCount: result.unreadCount,
      },
    };
  }

  async listAlertHistory(
    options: ListAlertHistoryOptions = {},
  ): Promise<NotificationCenterResponse<{ history: AlertHistoryRecord[] }>> {
    if (!this.options.alertHistoryStore) {
      return {
        status: 503,
        body: { error: { code: "not_configured", message: "alert history store not available" } },
      };
    }

    return {
      status: 200,
      body: {
        history: await this.options.alertHistoryStore.list(options),
      },
    };
  }

  async sendSlackTest(): Promise<NotificationCenterResponse<{ ok: true; sentAt: string }>> {
    if (!this.options.configStore) {
      return unavailable("config store not available");
    }

    const channels = this.options.configStore.getConfig().notifications?.channels ?? [];
    const slackChannel = channels.find((channel) => channel.type === "slack" && channel.enabled !== false);
    if (!slackChannel || slackChannel.type !== "slack" || !slackChannel.webhookUrl) {
      return {
        status: 400,
        body: {
          error: {
            code: "slack_not_configured",
            message: "Save a Slack webhook URL first, then try again.",
          },
        },
      };
    }

    const channel = this.options.createSlackChannel
      ? this.options.createSlackChannel({ webhookUrl: slackChannel.webhookUrl, logger: this.options.logger })
      : new SlackWebhookChannel({
          name: "slack_webhook_test",
          webhookUrl: slackChannel.webhookUrl,
          verbosity: "verbose",
          minSeverity: "info",
          logger: this.options.logger,
        });

    const event = buildTestEvent();
    try {
      await channel.notify(event);
      return {
        status: 200,
        body: { ok: true, sentAt: event.timestamp },
      };
    } catch (error) {
      const mapping = mapSlackError(error);
      return {
        status: mapping.status,
        body: {
          error: {
            code: mapping.code,
            message: mapping.message,
          },
        },
      };
    }
  }
}

interface SlackErrorMapping {
  status: number;
  code: string;
  message: string;
}

function unavailable(message: string): NotificationCenterResponse<never> {
  return {
    status: 503,
    body: { error: { code: "not_configured", message } },
  };
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
