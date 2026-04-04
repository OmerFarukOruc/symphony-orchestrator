import { describe, expect, it, vi } from "vitest";

import { AlertEngine } from "../../src/alerts/engine.js";
import { AlertHistoryStore } from "../../src/alerts/history-store.js";
import { TypedEventBus } from "../../src/core/event-bus.js";
import type { RisolutoEventMap } from "../../src/core/risoluto-events.js";
import { createMockLogger } from "../helpers.js";

function createConfigStore() {
  return {
    getConfig: () =>
      ({
        alerts: {
          rules: [
            {
              name: "worker-failures",
              type: "worker_failed",
              severity: "critical",
              channels: ["ops-webhook"],
              cooldownMs: 300_000,
              enabled: true,
            },
          ],
        },
      }) as never,
  };
}

describe("AlertEngine", () => {
  it("routes matching events through the notification manager and records history", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
        skippedDuplicate: false,
      }),
    };
    const historyStore = AlertHistoryStore.create(null);
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore,
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", {
      issueId: "issue-1",
      identifier: "ENG-1",
      error: "worker crashed",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notificationManager.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "alert_fired",
        severity: "critical",
        issue: expect.objectContaining({
          identifier: "ENG-1",
        }),
      }),
      { channelNames: ["ops-webhook"] },
    );
    const history = await historyStore.list();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      ruleName: "worker-failures",
      status: "delivered",
    });
  });

  it("suppresses repeated alerts inside the cooldown window", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
        skippedDuplicate: false,
      }),
    };
    const historyStore = AlertHistoryStore.create(null);
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore,
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", {
      issueId: "issue-1",
      identifier: "ENG-1",
      error: "worker crashed",
    });
    eventBus.emit("worker.failed", {
      issueId: "issue-1",
      identifier: "ENG-1",
      error: "worker crashed again",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notificationManager.notify).toHaveBeenCalledTimes(1);
    const history = await historyStore.list();
    expect(history.map((record) => record.status)).toEqual(["suppressed", "delivered"]);
  });
});
