import { describe, expect, it, vi } from "vitest";

import { wireNotifications, watchConfigChanges } from "../../src/cli/notifications.js";
import { NotificationManager } from "../../src/notification/manager.js";
import type { ConfigStore } from "../../src/config/store.js";
import type { RisolutoLogger } from "../../src/core/types.js";

function makeLogger(): RisolutoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as RisolutoLogger;
}

function makeConfigStore(input?: {
  slack?: { webhookUrl?: string; verbosity?: string };
  channels?: Array<Record<string, unknown>>;
}): ConfigStore {
  let listener: (() => void) | null = null;
  return {
    getConfig: vi.fn().mockReturnValue({
      notifications: input ? { slack: input.slack, channels: input.channels ?? [] } : undefined,
      server: { port: 4000 },
    }),
    subscribe: vi.fn((fn: () => void) => {
      listener = fn;
      return () => {
        listener = null;
      };
    }),
    _triggerListener: () => listener?.(),
  } as unknown as ConfigStore & { _triggerListener: () => void };
}

describe("wireNotifications", () => {
  it("registers a slack channel when webhook is configured", () => {
    const manager = new NotificationManager({ logger: makeLogger() });
    const store = makeConfigStore({ slack: { webhookUrl: "https://hooks.slack.com/xxx", verbosity: "critical" } });
    wireNotifications(manager, store, makeLogger());
    expect(manager.listChannels()).toContain("slack");
  });

  it("does not register slack when no webhook url", () => {
    const manager = new NotificationManager({ logger: makeLogger() });
    const store = makeConfigStore();
    wireNotifications(manager, store, makeLogger());
    expect(manager.listChannels()).not.toContain("slack");
  });

  it("removes existing channels before rewiring", () => {
    const manager = new NotificationManager({ logger: makeLogger() });
    const store1 = makeConfigStore({ slack: { webhookUrl: "https://hooks.slack.com/aaa", verbosity: "critical" } });
    wireNotifications(manager, store1, makeLogger());
    expect(manager.listChannels()).toContain("slack");

    // Rewire with no slack → channel removed
    const store2 = makeConfigStore();
    wireNotifications(manager, store2, makeLogger());
    expect(manager.listChannels()).not.toContain("slack");
  });

  it("registers configured webhook and desktop channels", () => {
    const manager = new NotificationManager({ logger: makeLogger() });
    const store = makeConfigStore({
      channels: [
        {
          type: "webhook",
          name: "ops",
          enabled: true,
          minSeverity: "warning",
          url: "https://notify.example/hook",
          headers: {},
        },
        { type: "desktop", name: "desktop", enabled: true, minSeverity: "info" },
      ],
    });

    wireNotifications(manager, store, makeLogger());

    expect(manager.listChannels()).toEqual(["desktop", "ops"]);
  });
});

describe("watchConfigChanges", () => {
  it("re-wires notifications on config change", () => {
    const manager = new NotificationManager({ logger: makeLogger() });
    const store = makeConfigStore({ slack: { webhookUrl: "https://hooks.slack.com/xxx", verbosity: "critical" } });
    const logger = makeLogger();
    watchConfigChanges(store, manager, 4000, logger);

    // Trigger the config change listener
    (store as unknown as { _triggerListener: () => void })._triggerListener();

    // After re-wire, Slack channel should still be registered
    expect(manager.listChannels()).toContain("slack");
  });

  it("logs a warning when port changes in config", () => {
    const manager = new NotificationManager({ logger: makeLogger() });
    const logger = makeLogger();
    let listener: (() => void) | null = null;
    const store = {
      getConfig: vi.fn().mockReturnValue({
        notifications: {},
        server: { port: 5000 }, // Different from initial
      }),
      subscribe: vi.fn((fn: () => void) => {
        listener = fn;
        return () => {
          listener = null;
        };
      }),
    } as unknown as ConfigStore;

    watchConfigChanges(store, manager, 4000, logger);
    listener!();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ previousPort: 4000, nextPort: 5000 }),
      expect.stringContaining("restart required"),
    );
  });
});
