import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../frontend/src/api";
import { createJsonResponse, createSnapshot } from "./helpers";

function createSessionStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear()),
  };
}

describe("frontend api", () => {
  beforeEach(() => {
    const sessionStorage = createSessionStorageMock();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage,
        location: { href: "http://127.0.0.1:4000/" },
        history: { replaceState: vi.fn() },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  it("returns the runtime snapshot from the API", async () => {
    const snapshotBody = createSnapshot("2026-03-20T00:00:00.000Z");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createJsonResponse(snapshotBody)));

    const snapshot = await api.getState();

    expect(snapshot).toEqual(snapshotBody);
  });

  it("adds a bearer token to protected reads when a token is bootstrapped from the URL", async () => {
    const snapshotBody = createSnapshot("2026-03-20T00:00:00.000Z");
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse(snapshotBody));
    // @ts-expect-error test override
    globalThis.window.location.href = "http://127.0.0.1:4000/?operator_token=op-secret";
    vi.stubGlobal("fetch", fetchMock);

    await api.getState();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/state", {
      headers: { Authorization: "Bearer op-secret" },
    });
    expect(globalThis.window.history.replaceState).toHaveBeenCalled();
  });

  it("fetches attempt checkpoints from the dedicated endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ checkpoints: [{ checkpointId: 1, attemptId: "att-1", ordinal: 1 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await api.getAttemptCheckpoints("att-1");

    expect(response.checkpoints).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/attempts/att-1/checkpoints", {
      headers: undefined,
    });
  });

  it("applies PR status filters when requesting tracked PRs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ prs: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getTrackedPrs({ status: "merged" });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/prs?status=merged", {
      headers: undefined,
    });
  });

  it("requests notifications with query parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ notifications: [], unreadCount: 0, totalCount: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getNotifications({ limit: 25, unread: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications?limit=25&unread=true", {
      headers: undefined,
    });
  });

  it("marks one notification as read", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ ok: true, notification: { id: "notif-1", read: true }, unreadCount: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.postNotificationRead("notif-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications/notif-1/read", {
      method: "POST",
      headers: undefined,
      body: undefined,
    });
  });

  it("marks all notifications as read", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true, updatedCount: 2, unreadCount: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.postNotificationsReadAll();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/notifications/read-all", {
      method: "POST",
      headers: undefined,
      body: undefined,
    });
  });
});
