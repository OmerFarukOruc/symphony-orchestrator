import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createJsonResponse, createSnapshot, installDomHarness } from "./helpers";
import { resetRuntimeClientForTesting } from "../../frontend/src/state/runtime-client";

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("startPolling", () => {
  let dom: ReturnType<typeof installDomHarness> | null = null;
  let restoreDom: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    const harness = installDomHarness();
    dom = harness;
    restoreDom = () => harness.restore();
  });

  afterEach(async () => {
    const polling = await import("../../frontend/src/state/polling");
    polling.stopPolling();
    resetRuntimeClientForTesting();
    restoreDom?.();
    dom = null;
    restoreDom = null;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips /state polling while the tab is hidden and refreshes when visible again", async () => {
    dom?.setHidden(true);

    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse(createSnapshot("2026-03-20T00:00:00.000Z")));
    vi.stubGlobal("fetch", fetchMock);

    const polling = await import("../../frontend/src/state/polling");
    polling.startPolling();

    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).not.toHaveBeenCalled();

    dom?.setHidden(false);
    dom?.dispatchVisibilityChange();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not start a second poll while the previous request is still running", async () => {
    const deferred = createDeferred<Response>();
    const fetchMock = vi.fn().mockImplementation(() => deferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    const polling = await import("../../frontend/src/state/polling");
    polling.startPolling();

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    deferred.resolve(createJsonResponse(createSnapshot("2026-03-20T00:00:00.000Z")));
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
