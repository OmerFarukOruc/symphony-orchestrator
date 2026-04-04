import { describe, expect, it, vi } from "vitest";

import type { NotificationChannel, NotificationEvent } from "../../src/notification/channel.js";
import { NotificationManager } from "../../src/notification/manager.js";

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

  it("auto-generates a dedupe key from event fields when none is provided", async () => {
    const notifySpy = vi.fn(async () => undefined);
    const manager = new NotificationManager({
      channels: [createChannel("ch", notifySpy)],
      dedupeWindowMs: 60_000,
    });
    const event = createEvent(); // no dedupeKey set

    await manager.notify(event);
    await manager.notify(event);

    expect(notifySpy).toHaveBeenCalledTimes(1);
  });

  it("allows same event after dedupe window expires", async () => {
    vi.useFakeTimers();
    const notifySpy = vi.fn(async () => undefined);
    const manager = new NotificationManager({
      channels: [createChannel("ch", notifySpy)],
      dedupeWindowMs: 1_000,
    });
    const event = createEvent({ dedupeKey: "key-1" });

    await manager.notify(event);
    vi.advanceTimersByTime(1_001);
    await manager.notify(event);

    expect(notifySpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("logs to the provided logger when a channel fails", async () => {
    const warnSpy = vi.fn();
    const logger = { warn: warnSpy, info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() };
    const manager = new NotificationManager({
      channels: [
        createChannel("broken", async () => {
          throw new Error("webhook unreachable");
        }),
      ],
      logger: logger as never,
    });

    await manager.notify(createEvent());

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "broken", error: "webhook unreachable" }),
      "notification channel failed",
    );
  });

  it("returns empty results when no channels are registered", async () => {
    const manager = new NotificationManager();

    const result = await manager.notify(createEvent());

    expect(result).toEqual({
      deliveredChannels: [],
      failedChannels: [],
      skippedDuplicate: false,
    });
  });

  it("persists notifications and emits notification timeline events", async () => {
    const createdRecord = {
      id: "notif-1",
      type: "worker_completed",
      severity: "info" as const,
      title: "Worker completed",
      message: "worker finished successfully",
      source: "MT-42",
      href: null,
      read: false,
      dedupeKey: "notif-key",
      metadata: { issueIdentifier: "MT-42" },
      deliverySummary: null,
      createdAt: "2026-03-17T02:00:00.000Z",
      updatedAt: "2026-03-17T02:00:00.000Z",
    };
    const updatedRecord = {
      ...createdRecord,
      deliverySummary: {
        deliveredChannels: ["ops"],
        failedChannels: [],
        skippedDuplicate: false,
      },
      updatedAt: "2026-03-17T02:00:01.000Z",
    };
    const store = {
      create: vi.fn().mockResolvedValue(createdRecord),
      updateDeliverySummary: vi.fn().mockResolvedValue(updatedRecord),
    };
    const eventBus = { emit: vi.fn() };
    const notifySpy = vi.fn(async () => undefined);
    const manager = new NotificationManager({
      channels: [createChannel("ops", notifySpy)],
      store: store as never,
      eventBus: eventBus as never,
    });

    const result = await manager.notify(createEvent({ dedupeKey: "notif-key" }));

    expect(store.create).toHaveBeenCalledOnce();
    expect(store.updateDeliverySummary).toHaveBeenCalledWith(
      "notif-1",
      expect.objectContaining({ deliveredChannels: ["ops"], skippedDuplicate: false }),
    );
    expect(eventBus.emit).toHaveBeenNthCalledWith(1, "notification.created", { notification: createdRecord });
    expect(eventBus.emit).toHaveBeenNthCalledWith(2, "notification.updated", { notification: updatedRecord });
    expect(result.deliveredChannels).toEqual(["ops"]);
  });

  it("persists duplicate notifications while still suppressing duplicate fanout", async () => {
    const createdRecord = {
      id: "notif-dup",
      type: "worker_retry",
      severity: "warning" as const,
      title: "Retry queued",
      message: "worker finished successfully",
      source: "MT-42",
      href: null,
      read: false,
      dedupeKey: "dup-key",
      metadata: null,
      deliverySummary: null,
      createdAt: "2026-03-17T02:00:00.000Z",
      updatedAt: "2026-03-17T02:00:00.000Z",
    };
    const store = {
      create: vi.fn().mockResolvedValue(createdRecord),
      updateDeliverySummary: vi.fn().mockResolvedValue({
        ...createdRecord,
        deliverySummary: {
          deliveredChannels: [],
          failedChannels: [],
          skippedDuplicate: true,
        },
      }),
    };
    const notifySpy = vi.fn(async () => undefined);
    const manager = new NotificationManager({
      channels: [createChannel("ops", notifySpy)],
      dedupeWindowMs: 60_000,
      store: store as never,
    });
    const event = createEvent({ dedupeKey: "dup-key", severity: "warning", type: "worker_retry" });

    await manager.notify(event);
    const second = await manager.notify(event);

    expect(store.create).toHaveBeenCalledTimes(2);
    expect(store.updateDeliverySummary).toHaveBeenLastCalledWith(
      "notif-dup",
      expect.objectContaining({ skippedDuplicate: true }),
    );
    expect(second.skippedDuplicate).toBe(true);
    expect(notifySpy).toHaveBeenCalledTimes(1);
  });

  it("removes stale deduplication entries during remember phase", async () => {
    vi.useFakeTimers();
    const notifySpy = vi.fn(async () => undefined);
    const manager = new NotificationManager({
      channels: [createChannel("ch", notifySpy)],
      dedupeWindowMs: 100,
    });

    // Fill multiple dedupe entries
    await manager.notify(createEvent({ dedupeKey: "a" }));
    await manager.notify(createEvent({ dedupeKey: "b" }));
    vi.advanceTimersByTime(101);

    // Next notify should clean up stale entries and deliver
    await manager.notify(createEvent({ dedupeKey: "c" }));

    // Re-sending "a" should now work since it was cleaned up
    await manager.notify(createEvent({ dedupeKey: "a" }));
    expect(notifySpy).toHaveBeenCalledTimes(4); // a, b, c, a-again

    vi.useRealTimers();
  });
});
