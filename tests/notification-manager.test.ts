import { describe, expect, it, vi } from "vitest";

import type { NotificationChannel, NotificationEvent } from "../src/notification-channel.js";
import { NotificationManager } from "../src/notification-manager.js";

function createEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
  return {
    type: "worker_completed",
    severity: "info",
    timestamp: "2026-03-17T02:00:00.000Z",
    message: "worker finished successfully",
    issue: {
      id: "issue-1",
      identifier: "MT-42",
      title: "Improve retries",
      state: "Done",
      url: "https://linear.app/example/issue/MT-42",
    },
    attempt: 1,
    ...overrides,
  };
}

function createChannel(name: string, notifyImpl?: (event: NotificationEvent) => Promise<void>): NotificationChannel {
  return {
    name,
    notify:
      notifyImpl ??
      (async () => {
        return;
      }),
  };
}

describe("NotificationManager", () => {
  it("fans out to all channels and returns delivery summary", async () => {
    const alphaNotify = vi.fn(async () => undefined);
    const betaNotify = vi.fn(async () => undefined);
    const manager = new NotificationManager({
      channels: [createChannel("alpha", alphaNotify), createChannel("beta", betaNotify)],
    });

    const result = await manager.notify(createEvent());

    expect(alphaNotify).toHaveBeenCalledTimes(1);
    expect(betaNotify).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      deliveredChannels: ["alpha", "beta"],
      failedChannels: [],
      skippedDuplicate: false,
    });
  });

  it("does not throw when one backend fails", async () => {
    const manager = new NotificationManager({
      channels: [
        createChannel("healthy"),
        createChannel("failing", async () => {
          throw new Error("webhook unavailable");
        }),
      ],
    });

    const result = await manager.notify(createEvent({ severity: "critical" }));

    expect(result.deliveredChannels).toEqual(["healthy"]);
    expect(result.failedChannels).toEqual([
      {
        channel: "failing",
        error: "webhook unavailable",
      },
    ]);
    expect(result.skippedDuplicate).toBe(false);
  });

  it("skips duplicate events within the dedupe window", async () => {
    const notifySpy = vi.fn(async () => undefined);
    const manager = new NotificationManager({
      channels: [createChannel("only", notifySpy)],
      dedupeWindowMs: 60_000,
    });
    const event = createEvent({
      dedupeKey: "run-1-worker_completed",
    });

    const first = await manager.notify(event);
    const second = await manager.notify(event);

    expect(first.skippedDuplicate).toBe(false);
    expect(second.skippedDuplicate).toBe(true);
    expect(notifySpy).toHaveBeenCalledTimes(1);
  });

  it("supports dynamic channel registration and removal", async () => {
    const notifySpy = vi.fn(async () => undefined);
    const manager = new NotificationManager();

    manager.registerChannel(createChannel("dynamic", notifySpy));
    expect(manager.listChannels()).toEqual(["dynamic"]);

    await manager.notify(createEvent());
    expect(notifySpy).toHaveBeenCalledTimes(1);

    expect(manager.removeChannel("dynamic")).toBe(true);
    expect(manager.listChannels()).toEqual([]);
  });
});
