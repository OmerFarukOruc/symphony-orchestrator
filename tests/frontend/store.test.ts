import { afterEach, describe, expect, it, vi } from "vitest";

import { APP_STATE_HEARTBEAT_EVENT, APP_STATE_UPDATE_EVENT, StateStore } from "../../frontend/src/state/store";
import { createSnapshot, installDomHarness } from "./helpers";

describe("StateStore", () => {
  let restoreDom: (() => void) | null = null;

  afterEach(() => {
    restoreDom?.();
    restoreDom = null;
  });

  it("does not emit an update when resetStale runs on an already-fresh store", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);
    store.resetStale();

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("emits a heartbeat when only snapshot freshness changes", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();
    const onHeartbeat = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);
    window.addEventListener(APP_STATE_HEARTBEAT_EVENT, onHeartbeat);

    store.mergeSnapshot(createSnapshot("2026-03-20T00:00:00.000Z"));
    onUpdate.mockReset();
    onHeartbeat.mockReset();

    store.mergeSnapshot(createSnapshot("2026-03-20T00:00:05.000Z"));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onHeartbeat).toHaveBeenCalledTimes(1);
    expect(store.getState().snapshot?.generated_at).toBe("2026-03-20T00:00:05.000Z");
  });

  it("collapses stale recovery and snapshot merge into one update", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();
    const onHeartbeat = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);
    window.addEventListener(APP_STATE_HEARTBEAT_EVENT, onHeartbeat);

    store.mergeSnapshot(createSnapshot("2026-03-20T00:00:00.000Z"));
    store.incrementStale();
    onUpdate.mockReset();
    onHeartbeat.mockReset();

    store.mergeSnapshot(createSnapshot("2026-03-20T00:00:05.000Z"), { resetStale: true });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onHeartbeat).not.toHaveBeenCalled();
    expect(store.getState().staleCount).toBe(0);
  });
});
