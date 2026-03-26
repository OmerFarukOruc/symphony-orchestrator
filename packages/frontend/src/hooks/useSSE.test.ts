import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "./query-client";
import { createSseConnection, invalidateFromSseEvent, reconnectDelayMs, type EventSourceLike } from "./useSSE";

type InvalidateFilters = Readonly<{
  queryKey?: readonly unknown[];
  refetchType?: "active" | "inactive" | "all" | "none";
}>;

type MockQueryClient = {
  invalidateQueries: ReturnType<typeof vi.fn<(filters?: InvalidateFilters) => Promise<void>>>;
};

class FakeEventSource implements EventSourceLike {
  public onerror: ((event: Event) => void) | null = null;
  public onopen: ((event: Event) => void) | null = null;

  private readonly listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const registered = this.listeners.get(type) ?? new Set<(event: MessageEvent<string>) => void>();
    registered.add(listener);
    this.listeners.set(type, registered);
  }

  removeEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {}

  emitOpen(): void {
    this.onopen?.({ type: "open" } as Event);
  }

  emitError(): void {
    this.onerror?.({ type: "error" } as Event);
  }

  emitEvent(type: string, data: unknown): void {
    const message = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(message);
    }
  }
}

function createMockQueryClient(): MockQueryClient {
  return {
    invalidateQueries: vi.fn(async (_filters?: InvalidateFilters) => undefined),
  };
}

function asQueryClient(client: MockQueryClient): QueryClient {
  return client as unknown as QueryClient;
}

function invalidateKeysFrom(client: MockQueryClient): Array<readonly unknown[]> {
  return client.invalidateQueries.mock.calls.map((call) => {
    const filters = call[0] as InvalidateFilters | undefined;
    return filters?.queryKey ?? [];
  });
}

describe("useSSE helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps reconnect delay at 30 seconds", () => {
    expect(reconnectDelayMs(0)).toBe(1_000);
    expect(reconnectDelayMs(1)).toBe(2_000);
    expect(reconnectDelayMs(2)).toBe(4_000);
    expect(reconnectDelayMs(3)).toBe(8_000);
    expect(reconnectDelayMs(4)).toBe(16_000);
    expect(reconnectDelayMs(5)).toBe(30_000);
    expect(reconnectDelayMs(6)).toBe(30_000);
  });

  it("invalidates mapped queries for each SSE event type", async () => {
    const queryClient = createMockQueryClient();

    await invalidateFromSseEvent(asQueryClient(queryClient), "attempt", { issue_id: "LIN-123", attempt_id: "att-1" });
    await invalidateFromSseEvent(asQueryClient(queryClient), "event", { attempt_id: "att-1" });
    await invalidateFromSseEvent(asQueryClient(queryClient), "snapshot", null);
    await invalidateFromSseEvent(asQueryClient(queryClient), "config", { key: "codex.model" });
    await invalidateFromSseEvent(asQueryClient(queryClient), "secret", { key: "OPENAI_API_KEY", action: "set" });

    expect(invalidateKeysFrom(queryClient)).toEqual([
      queryKeys.state,
      queryKeys.issues,
      queryKeys.issueAttempts,
      queryKeys.issue("LIN-123"),
      queryKeys.events("att-1"),
      queryKeys.state,
      queryKeys.config,
      queryKeys.setupStatus,
      queryKeys.setupStatusDetail,
      queryKeys.secrets,
      queryKeys.setupStatus,
      queryKeys.setupStatusDetail,
    ]);
  });

  it("refetches critical queries on initial open and reconnects after errors", async () => {
    const queryClient = createMockQueryClient();
    const firstSource = new FakeEventSource();
    const secondSource = new FakeEventSource();
    const createEventSource = vi.fn((_: string): EventSourceLike => secondSource);
    createEventSource.mockImplementationOnce((_: string): EventSourceLike => firstSource);

    const connection = createSseConnection({
      endpoint: "http://localhost:4002/api/v1/events",
      queryClient: asQueryClient(queryClient),
      createEventSource,
    });

    firstSource.emitOpen();
    await vi.runAllTimersAsync();

    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: queryKeys.state,
      refetchType: "all",
    });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: queryKeys.config,
      refetchType: "all",
    });
    expect(queryClient.invalidateQueries).toHaveBeenNthCalledWith(3, {
      queryKey: queryKeys.secrets,
      refetchType: "all",
    });

    firstSource.emitError();
    expect(createEventSource).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(createEventSource).toHaveBeenCalledTimes(2);

    secondSource.emitOpen();
    await vi.runAllTimersAsync();

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(3);

    secondSource.emitEvent("attempt", { issue_id: "LIN-9", attempt_id: "att-9" });
    await vi.runAllTimersAsync();

    expect(invalidateKeysFrom(queryClient).slice(-4)).toEqual([
      queryKeys.state,
      queryKeys.issues,
      queryKeys.issueAttempts,
      queryKeys.issue("LIN-9"),
    ]);

    connection.close();
  });
});
