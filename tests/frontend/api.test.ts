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

  it("requests Codex admin threads with query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ data: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getCodexThreads({
      limit: 10,
      sortKey: "updated_at",
      archived: true,
      cwd: "/tmp/workspace",
      modelProviders: ["openai"],
      sourceKinds: ["cli", "appServer"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/codex/threads?limit=10&sortKey=updated_at&archived=true&cwd=%2Ftmp%2Fworkspace&modelProviders=openai&sourceKinds=cli%2CappServer",
      {
        headers: undefined,
      },
    );
  });

  it("posts Codex thread rename requests to the admin API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await api.postCodexThreadRename("thr_123", "Renamed thread");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/codex/threads/thr_123/name", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed thread" }),
    });
  });

  it("loads the aggregated Codex admin snapshot from a single endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        capabilities: {
          connectedAt: "2026-04-08T10:55:04Z",
          initializationError: null,
          methods: { "thread/list": "supported" },
          notifications: { "app/list/updated": "enabled" },
        },
        account: { type: "chatgpt", email: "user@example.com" },
        requiresOpenaiAuth: true,
        rateLimits: { limitId: "codex" },
        rateLimitsByLimitId: { codex: { limitId: "codex" } },
        models: [{ id: "gpt-5.4", displayName: "GPT-5.4", isDefault: true }],
        threads: [{ id: "thr-1", name: "Main thread" }],
        loadedThreadIds: ["thr-1"],
        features: [{ name: "fast-mode", enabled: true }],
        collaborationModes: [{ id: "default", displayName: "Default" }],
        mcpServers: [{ name: "filesystem", status: "connected" }],
        pendingRequests: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await api.getCodexAdmin();

    expect(response.account?.email).toBe("user@example.com");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/codex/admin", {
      headers: undefined,
    });
  });

  it("requests Codex thread detail with turns from the admin API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ thread: { id: "thr_123", turns: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getCodexThread("thr_123", true);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/codex/threads/thr_123?includeTurns=true", {
      headers: undefined,
    });
  });

  it("posts Codex thread unsubscribe requests to the admin API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ status: "unsubscribed" }));
    vi.stubGlobal("fetch", fetchMock);

    await api.postCodexThreadUnsubscribe("thr_123");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/codex/threads/thr_123/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  });

  it("posts Codex user-input responses to the admin API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await api.postCodexUserInputResponse("req-1", { answers: [{ id: "choice", value: "yes" }] });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/codex/requests/user-input/req-1/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: { answers: [{ id: "choice", value: "yes" }] } }),
    });
  });

  it("reads Codex account status and rate limits from the admin API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ account: { type: "chatgpt", email: "user@example.com" } }))
      .mockResolvedValueOnce(createJsonResponse({ rateLimits: { limitId: "codex" } }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getCodexAccount();
    await api.getCodexAccountRateLimits();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/codex/account", {
      headers: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/codex/account/rate-limits", {
      headers: undefined,
    });
  });

  it("posts Codex account login and logout requests to the admin API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ type: "chatgpt", loginId: "login-1", authUrl: "https://chatgpt.com" }),
      )
      .mockResolvedValueOnce(createJsonResponse({ ok: true }))
      .mockResolvedValueOnce(createJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await api.postCodexAccountLoginStart({ type: "chatgpt" });
    await api.postCodexAccountLoginCancel("login-1");
    await api.postCodexAccountLogout();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/codex/account/login/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "chatgpt" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/codex/account/login/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginId: "login-1" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/codex/account/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  });

  it("returns the aggregate observability snapshot from the API", async () => {
    const snapshotBody = createSnapshot("2026-03-20T00:00:00.000Z");
    const observabilityBody = {
      generated_at: "2026-03-20T00:00:00.000Z",
      snapshot_root: "/tmp/observability",
      components: [],
      health: {
        status: "ok",
        counts: { ok: 1, warn: 0, error: 0 },
        surfaces: [],
      },
      traces: [],
      session_state: [],
      runtime_state: snapshotBody,
      raw_metrics: "# HELP risoluto_http_requests_total Total HTTP requests\nrisoluto_http_requests_total 2\n",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createJsonResponse(observabilityBody)));

    const summary = await api.getObservability();

    expect(summary).toEqual(observabilityBody);
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
