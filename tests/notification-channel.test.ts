import { describe, expect, it } from "vitest";

import { shouldDeliverByVerbosity, type NotificationEvent } from "../src/notification-channel.js";

function event(severity: NotificationEvent["severity"]): NotificationEvent {
  return {
    type: "worker_retry",
    severity,
    timestamp: "2026-03-17T00:00:00.000Z",
    message: "retry queued",
    issue: {
      id: "issue-1",
      identifier: "MT-42",
      title: "Retry logic",
      state: "In Progress",
      url: null,
    },
    attempt: 2,
  };
}

describe("shouldDeliverByVerbosity", () => {
  it("drops all events when off", () => {
    expect(shouldDeliverByVerbosity(event("info"), "off")).toBe(false);
    expect(shouldDeliverByVerbosity(event("critical"), "off")).toBe(false);
  });

  it("sends only critical events when critical mode is used", () => {
    expect(shouldDeliverByVerbosity(event("info"), "critical")).toBe(false);
    expect(shouldDeliverByVerbosity(event("critical"), "critical")).toBe(true);
  });

  it("sends all events when verbose mode is used", () => {
    expect(shouldDeliverByVerbosity(event("info"), "verbose")).toBe(true);
    expect(shouldDeliverByVerbosity(event("critical"), "verbose")).toBe(true);
  });
});
