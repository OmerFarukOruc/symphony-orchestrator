import { beforeEach, describe, expect, it, vi } from "vitest";

const getCodexAdmin = vi.fn();
const getCodexThread = vi.fn();
const postCodexThreadUnsubscribe = vi.fn();
const postCodexThreadRename = vi.fn();
const postCodexThreadFork = vi.fn();
const postCodexThreadArchive = vi.fn();
const postCodexThreadUnarchive = vi.fn();
const postCodexAccountLoginStart = vi.fn();
const postCodexAccountLoginCancel = vi.fn();
const postCodexAccountLogout = vi.fn();
const postCodexMcpReload = vi.fn();
const postCodexMcpOauthLogin = vi.fn();
const postCodexUserInputResponse = vi.fn();

vi.mock("../../frontend/src/api", () => ({
  api: {
    getCodexAdmin,
    getCodexThread,
    postCodexThreadUnsubscribe,
    postCodexThreadRename,
    postCodexThreadFork,
    postCodexThreadArchive,
    postCodexThreadUnarchive,
    postCodexAccountLoginStart,
    postCodexAccountLoginCancel,
    postCodexAccountLogout,
    postCodexMcpReload,
    postCodexMcpOauthLogin,
    postCodexUserInputResponse,
  },
}));

describe("codex admin client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the aggregated admin snapshot through one backend boundary", async () => {
    const payload = {
      capabilities: {
        connectedAt: "2026-04-08T10:55:04Z",
        initializationError: null,
        methods: { "thread/list": "supported" as const },
        notifications: { "app/list/updated": "enabled" as const },
      },
      account: { type: "chatgpt", email: "user@example.com" },
      requiresOpenaiAuth: true,
      rateLimits: null,
      rateLimitsByLimitId: null,
      models: [],
      threads: [],
      loadedThreadIds: [],
      features: [],
      collaborationModes: [],
      mcpServers: [],
      pendingRequests: [],
    };
    getCodexAdmin.mockResolvedValue(payload);

    const { loadCodexAdminData } = await import("../../frontend/src/views/codex-admin/codex-admin-client");
    await expect(loadCodexAdminData()).resolves.toEqual(payload);
    expect(getCodexAdmin).toHaveBeenCalledOnce();
  });

  it("loads and unwraps thread detail from the admin API", async () => {
    getCodexThread.mockResolvedValue({ thread: { id: "thr-1", turns: [] } });

    const { loadCodexThreadDetail } = await import("../../frontend/src/views/codex-admin/codex-admin-client");
    await expect(loadCodexThreadDetail("thr-1")).resolves.toEqual({ id: "thr-1", turns: [] });
    expect(getCodexThread).toHaveBeenCalledWith("thr-1", true);
  });

  it("delegates thread unload actions through the admin API", async () => {
    postCodexThreadUnsubscribe.mockResolvedValue({ status: "unsubscribed" });

    const { unsubscribeCodexThread } = await import("../../frontend/src/views/codex-admin/codex-admin-client");
    await expect(unsubscribeCodexThread("thr-1")).resolves.toBeUndefined();
    expect(postCodexThreadUnsubscribe).toHaveBeenCalledWith("thr-1");
  });

  it("delegates thread account, MCP, and pending-request mutations through the admin API boundary", async () => {
    postCodexThreadRename.mockResolvedValue({ ok: true });
    postCodexThreadFork.mockResolvedValue({ ok: true });
    postCodexThreadArchive.mockResolvedValue({ ok: true });
    postCodexThreadUnarchive.mockResolvedValue({ ok: true });
    postCodexAccountLoginStart.mockResolvedValue({ loginId: "login-1", authUrl: "https://example.com" });
    postCodexAccountLoginCancel.mockResolvedValue({ ok: true });
    postCodexAccountLogout.mockResolvedValue({ ok: true });
    postCodexMcpReload.mockResolvedValue({ ok: true });
    postCodexMcpOauthLogin.mockResolvedValue({ authUrl: "https://oauth.example.com" });
    postCodexUserInputResponse.mockResolvedValue({ ok: true });

    const client = await import("../../frontend/src/views/codex-admin/codex-admin-client");

    await expect(client.renameCodexThread("thr-1", "Renamed")).resolves.toBeUndefined();
    await expect(client.forkCodexThread("thr-1")).resolves.toBeUndefined();
    await expect(client.setCodexThreadArchived("thr-1", true)).resolves.toBeUndefined();
    await expect(client.setCodexThreadArchived("thr-1", false)).resolves.toBeUndefined();
    await expect(client.startCodexApiKeyLogin("sk-test")).resolves.toBeUndefined();
    await expect(client.startCodexBrowserLogin()).resolves.toEqual({
      loginId: "login-1",
      authUrl: "https://example.com",
    });
    await expect(client.cancelCodexBrowserLogin("login-1")).resolves.toBeUndefined();
    await expect(client.logoutCodexAccount()).resolves.toBeUndefined();
    await expect(client.reloadCodexMcp()).resolves.toBeUndefined();
    await expect(client.startCodexMcpOauthLogin("filesystem")).resolves.toEqual({
      authUrl: "https://oauth.example.com",
    });
    await expect(client.answerCodexUserInputRequest("req-1", { answers: [] })).resolves.toBeUndefined();

    expect(postCodexThreadRename).toHaveBeenCalledWith("thr-1", "Renamed");
    expect(postCodexThreadFork).toHaveBeenCalledWith("thr-1");
    expect(postCodexThreadArchive).toHaveBeenCalledWith("thr-1");
    expect(postCodexThreadUnarchive).toHaveBeenCalledWith("thr-1");
    expect(postCodexAccountLoginStart).toHaveBeenNthCalledWith(1, { type: "apiKey", apiKey: "sk-test" });
    expect(postCodexAccountLoginStart).toHaveBeenNthCalledWith(2, { type: "chatgpt" });
    expect(postCodexAccountLoginCancel).toHaveBeenCalledWith("login-1");
    expect(postCodexAccountLogout).toHaveBeenCalledOnce();
    expect(postCodexMcpReload).toHaveBeenCalledOnce();
    expect(postCodexMcpOauthLogin).toHaveBeenCalledWith("filesystem");
    expect(postCodexUserInputResponse).toHaveBeenCalledWith("req-1", { answers: [] });
  });
});
