import { describe, expect, it, vi } from "vitest";

import { WebhookChannel } from "../../src/notification/webhook-channel.js";
import type { NotificationEvent } from "../../src/notification/channel.js";

function createEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
  return {
    type: "worker_completed",
    severity: "info",
    timestamp: "2026-04-04T00:00:00.000Z",
    message: "run completed",
    issue: {
      id: "issue-1",
      identifier: "NIN-42",
      title: "Notifications bundle",
      state: "Done",
      url: "https://linear.app/example/issue/NIN-42",
    },
    attempt: 1,
    ...overrides,
  };
}

describe("WebhookChannel", () => {
  it("posts a generic notification payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: vi.fn() });
    const channel = new WebhookChannel({
      name: "ops",
      url: "https://notify.example/hook",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await channel.notify(createEvent());

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://notify.example/hook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json; charset=utf-8" }),
      }),
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as {
      notification: { message: string; issue: { identifier: string } };
    };
    expect(body.notification.issue.identifier).toBe("NIN-42");
    expect(body.notification.message).toBe("run completed");
  });

  it("honors minSeverity", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: vi.fn() });
    const channel = new WebhookChannel({
      name: "ops",
      url: "https://notify.example/hook",
      minSeverity: "critical",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await channel.notify(createEvent({ severity: "warning" }));

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on non-2xx responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue("down"),
    });
    const channel = new WebhookChannel({
      name: "ops",
      url: "https://notify.example/hook",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(channel.notify(createEvent())).rejects.toThrow("status 503");
  });
});
