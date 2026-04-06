import { describe, expect, it, vi, afterEach } from "vitest";
import { withRetry, withRetryReturn } from "../../src/utils/retry.js";
import type { RisolutoLogger } from "../../src/core/types.js";

function createLogger(): RisolutoLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as RisolutoLogger;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withRetry", () => {
  it("calls fn once when it succeeds immediately", async () => {
    const logger = createLogger();
    const fn = vi.fn(async () => {});

    await withRetry(logger, "op", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("retries on failure and succeeds on second attempt", async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
    });

    const promise = withRetry(logger, "op", fn);
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn).mock.calls[0][1]).toBe("write-back retry");
  });

  it("swallows error after max attempts (non-fatal)", async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const fn = vi.fn(async () => {
      throw new Error("always fails");
    });

    const promise = withRetry(logger, "op", fn, { maxAttempts: 3 });
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    expect(fn).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(3);
    const lastCall = vi.mocked(logger.warn).mock.calls.at(-1);
    expect(lastCall?.[1]).toContain("non-fatal");
  });

  it("respects custom maxAttempts", async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const fn = vi.fn(async () => {
      throw new Error("fail");
    });

    const promise = withRetry(logger, "op", fn, { maxAttempts: 2 });
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("withRetryReturn", () => {
  it("returns the value when fn succeeds immediately", async () => {
    const logger = createLogger();
    const fn = vi.fn(async () => 42);

    const result = await withRetryReturn(logger, "op", fn);

    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("retries on failure and returns value on second attempt", async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
      return "ok";
    });

    const promise = withRetryReturn(logger, "op", fn);
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("re-throws after max attempts", async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const fn = vi.fn(async () => {
      throw new Error("permanent failure");
    });

    const promise = withRetryReturn(logger, "op", fn, { maxAttempts: 3 });
    // Attach a catch handler immediately to prevent unhandled rejection warnings
    const caught = promise.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const caughtError = await caught;
    vi.useRealTimers();

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe("permanent failure");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects custom maxAttempts", async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const fn = vi.fn(async () => {
      throw new Error("fail");
    });

    const promise = withRetryReturn(logger, "op", fn, { maxAttempts: 2 });
    const caught = promise.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const caughtError = await caught;
    vi.useRealTimers();

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe("fail");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
