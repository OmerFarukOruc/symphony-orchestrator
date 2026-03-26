import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeSnapshot } from "../../frontend/src/types";
import { APP_STATE_HEARTBEAT_EVENT, APP_STATE_UPDATE_EVENT, StateStore } from "../../frontend/src/state/store";
import { createSnapshot, installDomHarness } from "./helpers";

describe("StateStore", () => {
  let restoreDom: (() => void) | null = null;

  afterEach(() => {
    restoreDom?.();
    restoreDom = null;
  });

  it("starts with null snapshot and zero staleCount", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();

    expect(store.getState().snapshot).toBeNull();
    expect(store.getState().staleCount).toBe(0);
  });

  it("emits update on first snapshot merge", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);
    store.mergeSnapshot(createSnapshot("2026-03-20T00:00:00.000Z"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(store.getState().snapshot).not.toBeNull();
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

  it("emits update when material snapshot data changes", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);

    store.mergeSnapshot(createSnapshot("2026-03-20T00:00:00.000Z"));
    onUpdate.mockReset();

    const changed: RuntimeSnapshot = {
      ...createSnapshot("2026-03-20T00:00:05.000Z"),
      counts: { running: 3, retrying: 1 },
    };
    store.mergeSnapshot(changed);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(store.getState().snapshot?.counts.running).toBe(3);
  });

  it("incrementStale raises the counter and emits update", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);

    store.incrementStale();
    expect(store.getState().staleCount).toBe(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    store.incrementStale();
    expect(store.getState().staleCount).toBe(2);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("resetStale emits update only when staleCount was non-zero", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);

    store.incrementStale();
    store.incrementStale();
    onUpdate.mockReset();

    store.resetStale();
    expect(store.getState().staleCount).toBe(0);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    onUpdate.mockReset();
    store.resetStale();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("detects array changes in snapshot data", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);

    store.mergeSnapshot(createSnapshot("2026-03-20T00:00:00.000Z"));
    onUpdate.mockReset();

    const withEvent: RuntimeSnapshot = {
      ...createSnapshot("2026-03-20T00:00:05.000Z"),
      recent_events: [
        {
          at: "2026-03-20T00:00:04.000Z",
          issue_id: "i1",
          issue_identifier: "TEST-1",
          session_id: null,
          event: "started",
          message: "Started",
          content: null,
        },
      ],
    };
    store.mergeSnapshot(withEvent);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(store.getState().snapshot?.recent_events).toHaveLength(1);
  });

  it("does not emit when re-merging an identical snapshot", () => {
    const dom = installDomHarness();
    restoreDom = () => dom.restore();
    const store = new StateStore();
    const onUpdate = vi.fn();
    const onHeartbeat = vi.fn();

    window.addEventListener(APP_STATE_UPDATE_EVENT, onUpdate);
    window.addEventListener(APP_STATE_HEARTBEAT_EVENT, onHeartbeat);

    const snapshot = createSnapshot("2026-03-20T00:00:00.000Z");
    store.mergeSnapshot(snapshot);
    onUpdate.mockReset();
    onHeartbeat.mockReset();

    store.mergeSnapshot(createSnapshot("2026-03-20T00:00:00.000Z"));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onHeartbeat).not.toHaveBeenCalled();
  });
});
