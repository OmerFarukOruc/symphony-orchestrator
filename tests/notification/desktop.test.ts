import { describe, expect, it, vi } from "vitest";

import { DesktopNotificationChannel } from "../../src/notification/desktop.js";
import type { NotificationEvent } from "../../src/notification/channel.js";

function createEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
  return {
    type: "worker_failed",
    severity: "critical",
    timestamp: "2026-04-04T00:00:00.000Z",
    message: "worker crashed",
    issue: {
      id: "issue-1",
      identifier: "NIN-42",
      title: "Notifications bundle",
      state: "In Progress",
      url: "https://linear.app/example/issue/NIN-42",
    },
    attempt: 2,
    ...overrides,
  };
}

describe("DesktopNotificationChannel", () => {
  it("runs the platform command when enabled", async () => {
    const runCommand = vi.fn().mockResolvedValue(undefined);
    const channel = new DesktopNotificationChannel({
      name: "desktop",
      runCommand,
    });

    await channel.notify(createEvent());

    if (process.platform === "linux") {
      expect(runCommand).toHaveBeenCalledWith("notify-send", expect.arrayContaining(["Risoluto CRITICAL"]));
      return;
    }
    if (process.platform === "darwin") {
      expect(runCommand).toHaveBeenCalledWith("osascript", expect.any(Array));
      return;
    }
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("does not run when minSeverity is higher than the event", async () => {
    const runCommand = vi.fn().mockResolvedValue(undefined);
    const channel = new DesktopNotificationChannel({
      name: "desktop",
      minSeverity: "critical",
      runCommand,
    });

    await channel.notify(createEvent({ severity: "warning" }));

    expect(runCommand).not.toHaveBeenCalled();
  });

  it("swallows command failures as best-effort delivery", async () => {
    const runCommand = vi.fn().mockRejectedValue(new Error("missing command"));
    const channel = new DesktopNotificationChannel({
      name: "desktop",
      runCommand,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
      } as never,
    });

    await expect(channel.notify(createEvent())).resolves.toBeUndefined();
  });
});
