import { describe, expect, it, vi } from "vitest";

import { createSingleFlight } from "../../frontend/src/utils/single-flight";

function createDeferred<T>() {
  let resolve = (_value: T): void => undefined;
  let reject = (_error: Error): void => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight", () => {
  it("reuses the same in-flight promise for concurrent calls", async () => {
    const deferred = createDeferred<string>();
    const run = vi.fn(async () => deferred.promise);
    const singleFlight = createSingleFlight(run);

    const first = singleFlight();
    const second = singleFlight();

    expect(run).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    deferred.resolve("ready");
    await expect(first).resolves.toBe("ready");
    await expect(second).resolves.toBe("ready");
  });

  it("allows a new call after the prior request settles", async () => {
    const run = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const singleFlight = createSingleFlight(run);

    await expect(singleFlight()).resolves.toBe("first");
    await expect(singleFlight()).resolves.toBe("second");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("clears in-flight state after rejection so subsequent calls succeed", async () => {
    const deferred = createDeferred<string>();
    const run = vi
      .fn()
      .mockImplementationOnce(async () => deferred.promise)
      .mockResolvedValueOnce("recovered");

    const singleFlight = createSingleFlight(run);

    const failingCall = singleFlight();
    deferred.reject(new Error("network down"));
    await expect(failingCall).rejects.toThrow("network down");

    await expect(singleFlight()).resolves.toBe("recovered");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("coalesces many concurrent callers into one execution", async () => {
    const deferred = createDeferred<number>();
    const run = vi.fn(async () => deferred.promise);
    const singleFlight = createSingleFlight(run);

    const calls = Array.from({ length: 10 }, () => singleFlight());
    expect(run).toHaveBeenCalledTimes(1);

    // All 10 promises are the same reference
    for (const call of calls) {
      expect(call).toBe(calls[0]);
    }

    deferred.resolve(42);
    const results = await Promise.all(calls);
    expect(results).toEqual(Array.from({ length: 10 }, () => 42));
  });

  it("allows interleaved success-failure-success cycles", async () => {
    let callCount = 0;
    const run = vi.fn(async () => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error("transient");
      }
      return `ok-${callCount}`;
    });
    const singleFlight = createSingleFlight(run);

    await expect(singleFlight()).resolves.toBe("ok-1");
    await expect(singleFlight()).rejects.toThrow("transient");
    await expect(singleFlight()).resolves.toBe("ok-3");
    expect(run).toHaveBeenCalledTimes(3);
  });
});
