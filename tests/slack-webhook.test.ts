import { describe, expect, it, vi } from "vitest";

import type { NotificationEvent } from "../src/notification-channel.js";
import { SlackWebhookChannel } from "../src/slack-webhook.js";

function baseEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
  return {
    type: "worker_failed",
    severity: "critical",
    timestamp: "2026-03-17T02:00:00.000Z",
    message: "worker crashed while applying patch",
    issue: {
      id: "issue-1",
      identifier: "MT-42",
      title: "Fix flaky test",
      state: "In Progress",
      url: "https://linear.app/example/issue/MT-42",
    },
    attempt: 3,
    metadata: {
      errorCode: "turn_failed",
      runId: "run-123",
    },
    ...overrides,
  };
}

describe("SlackWebhookChannel", () => {
  it("skips all messages when verbosity is off", async () => {
    const fetchMock = vi.fn();
    const channel = new SlackWebhookChannel({
      webhookUrl: "https://hooks.slack.test/one",
      verbosity: "off",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await channel.notify(baseEvent());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips non-critical messages when verbosity is critical", async () => {
    const fetchMock = vi.fn();
    const channel = new SlackWebhookChannel({
      webhookUrl: "https://hooks.slack.test/one",
      verbosity: "critical",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await channel.notify(baseEvent({ severity: "info", type: "worker_retry" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a block payload for critical events", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "ok",
    }));
    const channel = new SlackWebhookChannel({
      webhookUrl: "https://hooks.slack.test/one",
      verbosity: "critical",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await channel.notify(baseEvent());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.test/one",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json; charset=utf-8",
        }),
      }),
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.text).toContain("MT-42");
    expect(body.attachments[0].blocks[0].type).toBe("header");
    expect(body.attachments[0].blocks[2].text.text).toContain("worker crashed");
  });

  it("throws on non-success webhook responses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "temporary upstream outage",
    }));
    const channel = new SlackWebhookChannel({
      webhookUrl: "https://hooks.slack.test/one",
      verbosity: "verbose",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(channel.notify(baseEvent())).rejects.toThrow("status 503");
  });
});
