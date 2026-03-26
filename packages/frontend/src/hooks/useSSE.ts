import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "./query-client";

const SSE_ENDPOINT = "/api/v1/events";
const EVENT_NAMES = ["attempt", "event", "snapshot", "config", "secret"] as const;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

type SseEventName = (typeof EVENT_NAMES)[number];

type AttemptEventPayload = Readonly<{
  issue_id?: string | null;
  attempt_id?: string | null;
}>;

type StreamEventPayload = Readonly<{
  attempt_id?: string | null;
}>;

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  removeEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

type SseConnectionOptions = Readonly<{
  endpoint?: string;
  queryClient: QueryClient;
  createEventSource?: EventSourceFactory;
}>;

export type SseConnection = Readonly<{
  close: () => void;
}>;

function defaultEventSourceFactory(url: string): EventSourceLike {
  return new EventSource(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseEventPayload(data: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function invalidateIssueQueries(queryClient: QueryClient, issueId: string | null): Promise<unknown[]> {
  const invalidations: Promise<unknown>[] = [
    queryClient.invalidateQueries({ queryKey: queryKeys.issues }),
    queryClient.invalidateQueries({ queryKey: queryKeys.issueAttempts }),
  ];

  if (issueId !== null) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.issue(issueId) }));
  }

  return Promise.all(invalidations);
}

async function invalidateAttemptEvent(queryClient: QueryClient, payload: AttemptEventPayload): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.state }),
    invalidateIssueQueries(queryClient, asNullableString(payload.issue_id)),
  ]);
}

async function invalidateStreamEvent(queryClient: QueryClient, payload: StreamEventPayload): Promise<void> {
  const attemptId = asNullableString(payload.attempt_id);
  if (attemptId === null) {
    return;
  }
  await queryClient.invalidateQueries({ queryKey: queryKeys.events(attemptId) });
}

async function invalidateSnapshotEvent(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.state });
}

async function invalidateConfigEvent(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.config }),
    queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus }),
    queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail }),
  ]);
}

async function invalidateSecretEvent(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets }),
    queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus }),
    queryClient.invalidateQueries({ queryKey: queryKeys.setupStatusDetail }),
  ]);
}

export async function invalidateFromSseEvent(
  queryClient: QueryClient,
  eventName: SseEventName,
  payload: Record<string, unknown> | null,
): Promise<void> {
  if (eventName === "attempt") {
    await invalidateAttemptEvent(queryClient, payload ?? {});
    return;
  }

  if (eventName === "event") {
    await invalidateStreamEvent(queryClient, payload ?? {});
    return;
  }

  if (eventName === "snapshot") {
    await invalidateSnapshotEvent(queryClient);
    return;
  }

  if (eventName === "config") {
    await invalidateConfigEvent(queryClient);
    return;
  }

  await invalidateSecretEvent(queryClient);
}

async function refetchCriticalQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.state, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: queryKeys.config, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets, refetchType: "all" }),
  ]);
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

export function createSseConnection({
  endpoint = SSE_ENDPOINT,
  queryClient,
  createEventSource = defaultEventSourceFactory,
}: SseConnectionOptions): SseConnection {
  let source: EventSourceLike | null = null;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let reconnectAttempt = 0;
  let initialSyncCompleted = false;
  const listeners = new Map<SseEventName, (event: MessageEvent<string>) => void>();

  const clearReconnectTimer = (): void => {
    if (reconnectTimer === null) {
      return;
    }
    globalThis.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const detachListeners = (): void => {
    if (source === null) {
      listeners.clear();
      return;
    }

    for (const [eventName, listener] of listeners) {
      source.removeEventListener(eventName, listener);
    }
    listeners.clear();
  };

  const closeSource = (): void => {
    if (source === null) {
      return;
    }
    detachListeners();
    source.close();
    source = null;
  };

  const scheduleReconnect = (): void => {
    if (disposed || reconnectTimer !== null) {
      return;
    }

    const delay = reconnectDelayMs(reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = globalThis.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = (): void => {
    if (disposed) {
      return;
    }

    closeSource();

    try {
      source = createEventSource(endpoint);
    } catch {
      scheduleReconnect();
      return;
    }

    const currentSource = source;

    for (const eventName of EVENT_NAMES) {
      const listener = (event: MessageEvent<string>): void => {
        const payload = parseEventPayload(event.data);
        void invalidateFromSseEvent(queryClient, eventName, payload);
      };
      listeners.set(eventName, listener);
      currentSource.addEventListener(eventName, listener);
    }

    currentSource.onopen = () => {
      reconnectAttempt = 0;
      clearReconnectTimer();
      if (initialSyncCompleted) {
        return;
      }
      initialSyncCompleted = true;
      void refetchCriticalQueries(queryClient);
    };

    currentSource.onerror = () => {
      if (disposed) {
        return;
      }
      closeSource();
      scheduleReconnect();
    };
  };

  connect();

  return {
    close: () => {
      disposed = true;
      clearReconnectTimer();
      closeSource();
    },
  };
}

export function useSSE(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return;
    }

    const connection = createSseConnection({ queryClient });
    return () => {
      connection.close();
    };
  }, [queryClient]);
}
