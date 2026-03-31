import { afterEach, describe, expect, it, vi } from "vitest";

import { initErrorTracking, getErrorTracker, resetErrorTracking } from "../../src/core/error-tracking.js";
import type { RisolutoLogger } from "../../src/core/types.js";

function createMockLogger(): RisolutoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  } as unknown as RisolutoLogger;
}

describe("error-tracking", () => {
  afterEach(() => {
    resetErrorTracking();
    delete process.env.SENTRY_DSN;
  });

  it("returns a no-op tracker by default", () => {
    const logger = createMockLogger();
    const tracker = initErrorTracking(logger);

    // Should not throw
    tracker.captureException(new Error("test"));
    tracker.addBreadcrumb("nav", "navigation");
    tracker.setContext("user", { id: "123" });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("activates Sentry-backed tracker when SENTRY_DSN is set", () => {
    process.env.SENTRY_DSN = "https://abc123@sentry.io/1";
    const logger = createMockLogger();
    initErrorTracking(logger);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: expect.stringContaining("<redacted>") }),
      "Sentry error tracking initialized",
    );
  });

  it("captures exceptions with breadcrumbs and context", () => {
    process.env.SENTRY_DSN = "https://abc123@sentry.io/1";
    const logger = createMockLogger();
    initErrorTracking(logger);

    const tracker = getErrorTracker();
    tracker.addBreadcrumb("poll started", "orchestrator");
    tracker.setContext("issue", { identifier: "MT-42" });
    tracker.captureException(new Error("boom"), { attempt: 3 });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "boom",
        attempt: 3,
        breadcrumbs: expect.arrayContaining([expect.objectContaining({ message: "poll started" })]),
        contexts: expect.objectContaining({
          issue: { identifier: "MT-42" },
        }),
      }),
      "Captured exception",
    );
  });

  it("flushes breadcrumbs", async () => {
    process.env.SENTRY_DSN = "https://abc123@sentry.io/1";
    const logger = createMockLogger();
    initErrorTracking(logger);

    const tracker = getErrorTracker();
    tracker.addBreadcrumb("first", "test");
    await tracker.flush();
    tracker.captureException(new Error("after flush"));

    // After flush, breadcrumbs should be empty
    const errorCall = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(errorCall.breadcrumbs).toEqual([]);
  });

  it("ignores invalid SENTRY_DSN values", () => {
    process.env.SENTRY_DSN = "not-a-url";
    const logger = createMockLogger();
    initErrorTracking(logger);

    // Should stay as no-op
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("redacts DSN in log output", () => {
    process.env.SENTRY_DSN = "https://secret-key@sentry.io/1";
    const logger = createMockLogger();
    initErrorTracking(logger);

    const logCall = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(logCall.dsn).not.toContain("secret-key");
    expect(logCall.dsn).toContain("<redacted>");
  });
});
