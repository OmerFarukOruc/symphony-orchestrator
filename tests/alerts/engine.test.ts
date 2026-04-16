import { describe, expect, it, vi } from "vitest";

import { AlertEngine } from "../../src/alerts/engine.js";
import { AlertHistoryStore } from "../../src/persistence/sqlite/alert-history-store.js";
import { TypedEventBus } from "../../src/core/event-bus.js";
import type { RisolutoEventMap } from "../../src/core/risoluto-events.js";
import { openDatabase } from "../../src/persistence/sqlite/database.js";
import { createMockLogger } from "../helpers.js";

function makeHistoryStore() {
  return AlertHistoryStore.create(openDatabase(":memory:"));
}

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
    const historyStore = makeHistoryStore();
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

  it("logs pipeline failures instead of leaving them unhandled", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const logger = createMockLogger();
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: { notify: vi.fn() } as never,
      historyStore: makeHistoryStore(),
      logger,
      pipeline: {
        processEvent: vi.fn().mockRejectedValue(new Error("pipeline exploded")),
      } as never,
    });

    engine.start();
    eventBus.emit("worker.failed", {
      issueId: "issue-1",
      identifier: "ENG-1",
      error: "worker crashed",
    });
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        { channel: "worker.failed", error: "pipeline exploded" },
        "alert pipeline processing failed",
      );
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
    const historyStore = makeHistoryStore();
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
    // Drain any pending async work deterministically. A single setTimeout(0)
    // flush can miss continuations that hop through multiple await points
    // (notify -> historyRecord -> historyStore.create) under heavy parallel
    // test load, which previously caused rare order-dependent failures.
    await vi.waitFor(async () => {
      expect(notificationManager.notify).toHaveBeenCalledTimes(1);
      const pending = await historyStore.list();
      expect(pending).toHaveLength(2);
    });

    const history = await historyStore.list();
    // Two events in the same millisecond have no deterministic wall-clock
    // order, so assert the multiset of statuses rather than a specific
    // sequence. The engine guarantees exactly one delivered + one
    // suppressed for a cooldown-suppressed pair, which is the behavior
    // that matters.
    const statuses = history.map((record) => record.status).sort();
    expect(statuses).toEqual(["delivered", "suppressed"]);
  });

  it("records failed history when no selected channels actually deliver", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: [],
        failedChannels: [],
        skippedDuplicate: false,
      }),
    };
    const historyStore = makeHistoryStore();
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore,
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", {
      issueId: "issue-2",
      identifier: "ENG-2",
      error: "worker crashed",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const history = await historyStore.list();
    expect(history[0]).toMatchObject({
      ruleName: "worker-failures",
      status: "failed",
    });
  });

  it("does not fire for disabled rules", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: [],
        failedChannels: [],
        skippedDuplicate: false,
      }),
    };
    const engine = new AlertEngine({
      configStore: {
        getConfig: () =>
          ({
            alerts: {
              rules: [
                {
                  name: "disabled-rule",
                  type: "worker_failed",
                  severity: "critical",
                  channels: [],
                  cooldownMs: 300_000,
                  enabled: false,
                },
              ],
            },
          }) as never,
      },
      eventBus,
      notificationManager: notificationManager as never,
      historyStore: makeHistoryStore(),
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { identifier: "ENG-1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationManager.notify).not.toHaveBeenCalled();
  });

  it("ignores events on notification channels (avoids feedback loops)", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: [],
        failedChannels: [],
        skippedDuplicate: false,
      }),
    };
    const engine = new AlertEngine({
      configStore: {
        getConfig: () =>
          ({
            alerts: {
              rules: [
                {
                  name: "all-events",
                  type: "notification.sent",
                  severity: "info",
                  channels: [],
                  cooldownMs: 0,
                  enabled: true,
                },
              ],
            },
          }) as never,
      },
      eventBus,
      notificationManager: notificationManager as never,
      historyStore: makeHistoryStore(),
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("notification.sent" as never, { identifier: "ENG-1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationManager.notify).not.toHaveBeenCalled();
  });

  it("records partial_failure when some channels deliver and some fail", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [{ channel: "slack", error: "down" }],
        skippedDuplicate: false,
      }),
    };
    const historyStore = makeHistoryStore();
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore,
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { identifier: "ENG-3", error: "partial" });
    await vi.waitFor(async () => {
      const history = await historyStore.list();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("partial_failure");
    });
  });

  it("builds message with identifier only (no error)", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
      }),
    };
    const historyStore = makeHistoryStore();
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore,
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { identifier: "ENG-99" });
    await vi.waitFor(async () => {
      const history = await historyStore.list();
      expect(history[0].message).toBe("ENG-99 matched worker-failures via worker.failed");
    });
  });

  it("builds message with error only (no identifier)", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
      }),
    };
    const historyStore = makeHistoryStore();
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore,
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { error: "timeout" });
    await vi.waitFor(async () => {
      const history = await historyStore.list();
      expect(history[0].message).toBe("worker-failures matched worker.failed: timeout");
    });
  });

  it("builds bare message (no identifier and no error)", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
      }),
    };
    const historyStore = makeHistoryStore();
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore,
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", {});
    await vi.waitFor(async () => {
      const history = await historyStore.list();
      expect(history[0].message).toBe("worker-failures matched worker.failed");
    });
  });

  it("logs warning when history persistence fails", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
      }),
    };
    const brokenStore = {
      create: vi.fn().mockRejectedValue(new Error("db write error")),
      list: vi.fn().mockResolvedValue([]),
    };
    const logger = createMockLogger();
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore: brokenStore,
      logger,
    });

    engine.start();
    eventBus.emit("worker.failed", { identifier: "ENG-1" });
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ ruleName: "worker-failures", error: "db write error" }),
        "alert history persistence failed",
      );
    });
  });

  it("uses issueId for cooldown key when identifier is absent", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
      }),
    };
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore: makeHistoryStore(),
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { issueId: "id-42" });
    await vi.waitFor(() => {
      expect(notificationManager.notify).toHaveBeenCalledOnce();
    });

    // Same issueId — should be suppressed
    eventBus.emit("worker.failed", { issueId: "id-42" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationManager.notify).toHaveBeenCalledOnce();
  });

  it("passes channels to notificationManager when rule specifies them", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
      }),
    };
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore: makeHistoryStore(),
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { identifier: "ENG-1" });
    await vi.waitFor(() => {
      expect(notificationManager.notify).toHaveBeenCalledWith(expect.anything(), { channelNames: ["ops-webhook"] });
    });
  });

  it("passes undefined channelNames when rule has empty channels array", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: [],
        failedChannels: [],
      }),
    };
    const engine = new AlertEngine({
      configStore: {
        getConfig: () =>
          ({
            alerts: {
              rules: [
                {
                  name: "broadcast",
                  type: "worker_failed",
                  severity: "info",
                  channels: [],
                  cooldownMs: 0,
                  enabled: true,
                },
              ],
            },
          }) as never,
      },
      eventBus,
      notificationManager: notificationManager as never,
      historyStore: makeHistoryStore(),
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { identifier: "ENG-1" });
    await vi.waitFor(() => {
      expect(notificationManager.notify).toHaveBeenCalledWith(expect.anything(), { channelNames: undefined });
    });
  });

  it("extracts attempt number from payload", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
      }),
    };
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore: makeHistoryStore(),
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { identifier: "ENG-1", attempt: 3 });
    await vi.waitFor(() => {
      expect(notificationManager.notify).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 3 }),
        expect.anything(),
      );
    });
  });

  it("extracts null attempt when payload has no attempt field", async () => {
    const eventBus = new TypedEventBus<RisolutoEventMap>();
    const notificationManager = {
      notify: vi.fn().mockResolvedValue({
        deliveredChannels: ["ops-webhook"],
        failedChannels: [],
      }),
    };
    const engine = new AlertEngine({
      configStore: createConfigStore() as never,
      eventBus,
      notificationManager: notificationManager as never,
      historyStore: makeHistoryStore(),
      logger: createMockLogger(),
    });

    engine.start();
    eventBus.emit("worker.failed", { identifier: "ENG-1" });
    await vi.waitFor(() => {
      expect(notificationManager.notify).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: null }),
        expect.anything(),
      );
    });
  });
});
