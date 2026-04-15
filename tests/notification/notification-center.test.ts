import { describe, expect, it, vi } from "vitest";

import { NotificationCenter } from "../../src/notification/notification-center.js";
import { createMockLogger } from "../helpers.js";

describe("NotificationCenter", () => {
  it("lists notifications with unread and total counts", async () => {
    const notificationStore = {
      list: vi.fn().mockResolvedValue([{ id: "n-1" }]),
      countUnread: vi.fn().mockResolvedValue(1),
      countAll: vi.fn().mockResolvedValue(3),
    };
    const center = new NotificationCenter({
      notificationStore: notificationStore as never,
    });

    const result = await center.listNotifications({ unreadOnly: true, limit: 5 });

    expect(notificationStore.list).toHaveBeenCalledWith({ unreadOnly: true, limit: 5 });
    expect(result).toEqual({
      status: 200,
      body: {
        notifications: [{ id: "n-1" }],
        unreadCount: 1,
        totalCount: 3,
      },
    });
  });

  it("marks a notification read and returns the updated unread count", async () => {
    const notificationStore = {
      markRead: vi.fn().mockResolvedValue({ id: "n-1", read: true }),
      countUnread: vi.fn().mockResolvedValue(2),
    };
    const center = new NotificationCenter({
      notificationStore: notificationStore as never,
    });

    const result = await center.markNotificationRead("n-1");

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        notification: { id: "n-1", read: true },
        unreadCount: 2,
      },
    });
  });

  it("lists alert history through the same service boundary", async () => {
    const alertHistoryStore = {
      list: vi.fn().mockResolvedValue([{ id: "a-1", ruleName: "worker-failures" }]),
    };
    const center = new NotificationCenter({
      alertHistoryStore: alertHistoryStore as never,
    });

    const result = await center.listAlertHistory({ ruleName: "worker-failures", limit: 3 });

    expect(alertHistoryStore.list).toHaveBeenCalledWith({ ruleName: "worker-failures", limit: 3 });
    expect(result).toEqual({
      status: 200,
      body: {
        history: [{ id: "a-1", ruleName: "worker-failures" }],
      },
    });
  });

  it("sends a Slack test notification through the configured channel", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const center = new NotificationCenter({
      configStore: {
        getConfig: () =>
          ({
            notifications: {
              channels: [
                {
                  type: "slack",
                  name: "slack",
                  enabled: true,
                  minSeverity: "info",
                  webhookUrl: "https://hooks.slack.com/services/T/B/X",
                  verbosity: "critical",
                },
              ],
            },
          }) as never,
      },
      logger: createMockLogger(),
      createSlackChannel: () => ({ name: "slack", notify }),
    });

    const result = await center.sendSlackTest();

    expect(notify).toHaveBeenCalledOnce();
    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({ ok: true, sentAt: expect.any(String) }));
  });

  it("maps Slack upstream failures into stable response payloads", async () => {
    const center = new NotificationCenter({
      configStore: {
        getConfig: () =>
          ({
            notifications: {
              channels: [
                {
                  type: "slack",
                  name: "slack",
                  enabled: true,
                  minSeverity: "info",
                  webhookUrl: "https://hooks.slack.com/services/T/B/X",
                  verbosity: "critical",
                },
              ],
            },
          }) as never,
      },
      createSlackChannel: () => ({
        name: "slack",
        notify: vi.fn(async () => {
          throw new Error("failed with status 404");
        }),
      }),
    });

    const result = await center.sendSlackTest();

    expect(result).toEqual({
      status: 404,
      body: {
        error: {
          code: "webhook_invalid",
          message: expect.stringContaining("Slack rejected the webhook URL"),
        },
      },
    });
  });
});
