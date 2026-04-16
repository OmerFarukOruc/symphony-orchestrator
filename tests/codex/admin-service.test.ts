import { describe, expect, it, vi } from "vitest";

import { createCodexAdminService } from "../../src/codex/admin-service.js";

describe("CodexAdminService", () => {
  it("routes account and MCP mutations through one control-plane boundary", async () => {
    const controlPlane = {
      getCapabilities: vi.fn().mockResolvedValue({
        connectedAt: null,
        initializationError: null,
        methods: {},
        notifications: {},
      }),
      listPendingUserInputRequests: vi.fn().mockReturnValue([]),
      respondToRequest: vi.fn().mockResolvedValue(true),
      request: vi.fn().mockResolvedValue({ ok: true }),
    };
    const service = createCodexAdminService({ controlPlane });

    await service.startAccountLogin({ type: "chatgpt", apiKey: "ignored" });
    await service.cancelAccountLogin("login-1");
    await service.logoutAccount();
    await service.reloadMcpServers();
    await service.startMcpOauthLogin("filesystem");

    expect(controlPlane.request).toHaveBeenNthCalledWith(1, "account/login/start", {
      type: "chatgpt",
      apiKey: "ignored",
    });
    expect(controlPlane.request).toHaveBeenNthCalledWith(2, "account/login/cancel", { loginId: "login-1" });
    expect(controlPlane.request).toHaveBeenNthCalledWith(3, "account/logout", {});
    expect(controlPlane.request).toHaveBeenNthCalledWith(4, "config/mcpServer/reload", {});
    expect(controlPlane.request).toHaveBeenNthCalledWith(5, "mcpServer/oauth/login", { name: "filesystem" });
  });

  it("routes thread mutations and pending-request responses through one control-plane boundary", async () => {
    const controlPlane = {
      getCapabilities: vi.fn().mockResolvedValue({
        connectedAt: null,
        initializationError: null,
        methods: {},
        notifications: {},
      }),
      listPendingUserInputRequests: vi.fn().mockReturnValue([
        {
          requestId: "req-1",
          method: "item/tool/requestUserInput",
          threadId: "thr-1",
          turnId: "turn-1",
          questions: [],
          createdAt: "2026-04-14T00:00:00Z",
        },
      ]),
      respondToRequest: vi.fn().mockResolvedValue(true),
      request: vi.fn().mockResolvedValue({ ok: true }),
    };
    const service = createCodexAdminService({ controlPlane });

    await service.renameThread("thr-1", "Renamed");
    await service.forkThread("thr-1");
    await service.archiveThread("thr-1");
    await service.unarchiveThread("thr-1");
    await service.unsubscribeThread("thr-1");
    expect(service.listPendingUserInputRequests()).toEqual({
      data: [
        {
          requestId: "req-1",
          method: "item/tool/requestUserInput",
          threadId: "thr-1",
          turnId: "turn-1",
          questions: [],
          createdAt: "2026-04-14T00:00:00Z",
        },
      ],
    });
    await expect(service.respondToUserInput("req-1", { answers: [] })).resolves.toBe(true);

    expect(controlPlane.request).toHaveBeenNthCalledWith(1, "thread/name/set", {
      threadId: "thr-1",
      name: "Renamed",
    });
    expect(controlPlane.request).toHaveBeenNthCalledWith(2, "thread/fork", { threadId: "thr-1" });
    expect(controlPlane.request).toHaveBeenNthCalledWith(3, "thread/archive", { threadId: "thr-1" });
    expect(controlPlane.request).toHaveBeenNthCalledWith(4, "thread/unarchive", { threadId: "thr-1" });
    expect(controlPlane.request).toHaveBeenNthCalledWith(5, "thread/unsubscribe", { threadId: "thr-1" });
    expect(controlPlane.respondToRequest).toHaveBeenCalledWith("req-1", { answers: [] });
  });
});
