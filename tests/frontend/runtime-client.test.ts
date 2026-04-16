import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StateStore } from "../../frontend/src/state/store";
import { createRuntimeClient } from "../../frontend/src/state/runtime-client";
import { createSnapshot, installDomHarness } from "./helpers";

interface FakeEventSource {
  close: ReturnType<typeof vi.fn>;
  onopen: ((this: EventSource, ev: Event) => unknown) | null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null;
}

function createFakeEventSource(): FakeEventSource {
  return {
    close: vi.fn(),
    onopen: null,
    onmessage: null,
    onerror: null,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("RuntimeClient", () => {
  let restoreDom: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    const harness = installDomHarness();
    restoreDom = () => harness.restore();
  });

  afterEach(() => {
    restoreDom?.();
    restoreDom = null;
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("starts one runtime boundary that polls state and reacts to lifecycle SSE events", async () => {
    const eventSource = createFakeEventSource();
    const eventSourceFactory = vi.fn(() => eventSource);
    const getState = vi
      .fn()
      .mockResolvedValueOnce(createSnapshot("2026-03-20T00:00:00.000Z"))
      .mockResolvedValueOnce(createSnapshot("2026-03-20T00:00:05.000Z"));
    const lifecycleHandler = vi.fn();
    const client = createRuntimeClient({
      api: { getState },
      buildReadTokenQueryParam: () => "read_token=read-secret",
      eventSourceFactory,
      store: new StateStore(),
    });

    const unsubscribe = client.subscribeIssueLifecycle("ENG-1", lifecycleHandler);
    client.start();
    await flushMicrotasks();

    expect(getState).toHaveBeenCalledTimes(1);
    expect(eventSourceFactory).toHaveBeenCalledWith("/api/v1/events?read_token=read-secret");

    eventSource.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "issue.started",
          payload: { identifier: "ENG-1" },
        }),
      }),
    );
    expect(lifecycleHandler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    await flushMicrotasks();

    expect(getState).toHaveBeenCalledTimes(2);

    unsubscribe();
    client.stop();
  });

  it("reconnects the SSE stream through the same runtime client after an error", async () => {
    const firstSource = createFakeEventSource();
    const secondSource = createFakeEventSource();
    const sources = [firstSource, secondSource];
    const eventSourceFactory = vi.fn((url: string) => {
      expect(url).toBe("/api/v1/events");
      const source = sources.shift();
      if (!source) {
        throw new Error("missing fake event source");
      }
      return source;
    });
    const client = createRuntimeClient({
      api: { getState: vi.fn().mockResolvedValue(createSnapshot("2026-03-20T00:00:00.000Z")) },
      buildReadTokenQueryParam: () => "",
      eventSourceFactory,
      store: new StateStore(),
    });

    client.connectEventSource();
    expect(eventSourceFactory).toHaveBeenCalledTimes(1);

    firstSource.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(eventSourceFactory).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(eventSourceFactory).toHaveBeenCalledTimes(2);

    client.stop();
  });

  it("subscribes to state updates and optional heartbeats through the runtime boundary", () => {
    const client = createRuntimeClient({
      api: { getState: vi.fn().mockResolvedValue(createSnapshot("2026-03-20T00:00:00.000Z")) },
      buildReadTokenQueryParam: () => "",
      eventSourceFactory: () => createFakeEventSource(),
      store: new StateStore(),
    });
    const handler = vi.fn();

    const unsubscribe = client.subscribeState(handler, { includeHeartbeat: true });
    window.dispatchEvent(new CustomEvent("state:update", { detail: client.getAppState() }));
    window.dispatchEvent(new CustomEvent("state:heartbeat", { detail: client.getAppState() }));

    expect(handler).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("subscribes to poll-complete notifications through the runtime boundary", () => {
    const client = createRuntimeClient({
      api: { getState: vi.fn().mockResolvedValue(createSnapshot("2026-03-20T00:00:00.000Z")) },
      buildReadTokenQueryParam: () => "",
      eventSourceFactory: () => createFakeEventSource(),
      store: new StateStore(),
    });
    const handler = vi.fn();

    const unsubscribe = client.subscribePollComplete(handler);
    window.dispatchEvent(new CustomEvent("risoluto:poll-complete"));

    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("subscribes to webhook health and receipt notifications through the runtime boundary", () => {
    const client = createRuntimeClient({
      api: { getState: vi.fn().mockResolvedValue(createSnapshot("2026-03-20T00:00:00.000Z")) },
      buildReadTokenQueryParam: () => "",
      eventSourceFactory: () => createFakeEventSource(),
      store: new StateStore(),
    });
    const healthHandler = vi.fn();
    const receiptHandler = vi.fn();

    const unsubscribeHealth = client.subscribeWebhookHealth(healthHandler);
    const unsubscribeReceipt = client.subscribeWebhookReceived(receiptHandler);

    window.dispatchEvent(
      new CustomEvent("risoluto:webhook-health-changed", {
        detail: { status: "healthy", connected: true },
      }),
    );
    window.dispatchEvent(new CustomEvent("risoluto:webhook-received"));

    expect(healthHandler).toHaveBeenCalledWith({ status: "healthy", connected: true });
    expect(receiptHandler).toHaveBeenCalledTimes(1);

    unsubscribeHealth();
    unsubscribeReceipt();
  });

  it("subscribes to workspace events through the runtime boundary", () => {
    const client = createRuntimeClient({
      api: { getState: vi.fn().mockResolvedValue(createSnapshot("2026-03-20T00:00:00.000Z")) },
      buildReadTokenQueryParam: () => "",
      eventSourceFactory: () => createFakeEventSource(),
      store: new StateStore(),
    });
    const handler = vi.fn();

    const unsubscribe = client.subscribeWorkspaceEvents(handler);
    window.dispatchEvent(new CustomEvent("risoluto:workspace-event"));

    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("subscribes to unfiltered runtime events through the runtime boundary", () => {
    const client = createRuntimeClient({
      api: { getState: vi.fn().mockResolvedValue(createSnapshot("2026-03-20T00:00:00.000Z")) },
      buildReadTokenQueryParam: () => "",
      eventSourceFactory: () => createFakeEventSource(),
      store: new StateStore(),
    });
    const handler = vi.fn();

    const unsubscribe = client.subscribeRuntimeEvents(handler);
    window.dispatchEvent(
      new CustomEvent("risoluto:any-event", {
        detail: { type: "codex.event", payload: { source: "worker" } },
      }),
    );

    expect(handler).toHaveBeenCalledWith({ type: "codex.event", payload: { source: "worker" } });

    unsubscribe();
  });
});
