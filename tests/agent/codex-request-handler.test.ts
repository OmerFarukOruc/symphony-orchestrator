import { describe, expect, it, vi } from "vitest";

import { handleCodexRequest } from "../../src/agent/codex-request-handler.js";
import type { JsonRpcRequest } from "../../src/codex/protocol.js";
import type { GithubApiToolClient } from "../../src/git/github-api-tool.js";
import type { TrackerToolProvider } from "../../src/tracker/tool-provider.js";

vi.mock("../../src/git/github-api-tool.js", () => ({
  handleGithubApiToolCall: vi.fn().mockResolvedValue({ success: true, contentItems: [] }),
}));

const { handleGithubApiToolCall } = await import("../../src/git/github-api-tool.js");

function makeRequest(method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params };
}

function makeLinearProvider(): TrackerToolProvider & { handleToolCall: ReturnType<typeof vi.fn> } {
  const handleToolCall = vi
    .fn()
    .mockImplementation(async (toolName: string) =>
      toolName === "linear_graphql" ? { response: { success: true, contentItems: [] }, fatalFailure: null } : null,
    );
  return {
    toolNames: ["linear_graphql"],
    handleToolCall,
  };
}

function makeNullProvider(): TrackerToolProvider {
  return {
    toolNames: [],
    handleToolCall: vi.fn().mockResolvedValue(null),
  };
}

function mockGithubClient(): GithubApiToolClient {
  return {
    addPrComment: vi.fn().mockResolvedValue({ id: 1 }),
    getPrStatus: vi.fn().mockResolvedValue({ state: "open" }),
  };
}

describe("handleCodexRequest", () => {
  describe("approval auto-accept", () => {
    it("accepts commandExecution approval for session", async () => {
      const result = await handleCodexRequest(makeRequest("item/commandExecution/requestApproval"), makeNullProvider());
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ decision: "acceptForSession" });
    });

    it("accepts fileChange approval for session", async () => {
      const result = await handleCodexRequest(makeRequest("item/fileChange/requestApproval"), makeNullProvider());
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ decision: "acceptForSession" });
    });

    it("echoes back permissionProfile for permissions approval", async () => {
      const params = { permissionProfile: "full-auto" };
      const result = await handleCodexRequest(
        makeRequest("item/permissions/requestApproval", params),
        makeNullProvider(),
      );
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ permissions: "full-auto", scope: "session" });
    });

    it("falls back to permissions field when permissionProfile is absent", async () => {
      const params = { permissions: { read: true, write: true } };
      const result = await handleCodexRequest(
        makeRequest("item/permissions/requestApproval", params),
        makeNullProvider(),
      );
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({
        permissions: { read: true, write: true },
        scope: "session",
      });
    });

    it("returns null permissions when neither field is present", async () => {
      const result = await handleCodexRequest(makeRequest("item/permissions/requestApproval", {}), makeNullProvider());
      expect(result.response).toEqual({ permissions: null, scope: "session" });
    });

    it("handles non-object params gracefully for permissions approval", async () => {
      const result = await handleCodexRequest(
        makeRequest("item/permissions/requestApproval", "not-an-object"),
        makeNullProvider(),
      );
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ permissions: null, scope: "session" });
    });
  });

  describe("tool dispatch — linear_graphql", () => {
    it("dispatches linear_graphql call via name param to provider", async () => {
      const provider = makeLinearProvider();
      const params = { name: "linear_graphql", arguments: { query: "{ viewer { id } }" } };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), provider);

      expect(result.fatalFailure).toBeNull();
      expect(result.response).toBeDefined();
      expect(provider.handleToolCall).toHaveBeenCalledWith("linear_graphql", { query: "{ viewer { id } }" });
    });

    it("dispatches linear_graphql call via toolName param to provider", async () => {
      const provider = makeLinearProvider();
      const params = { toolName: "linear_graphql", args: "{ viewer { id } }" };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), provider);

      expect(result.fatalFailure).toBeNull();
      expect(provider.handleToolCall).toHaveBeenCalledWith("linear_graphql", "{ viewer { id } }");
    });

    it("returns tool error when provider returns null (tool not supported)", async () => {
      const params = { name: "linear_graphql", arguments: { query: "{ viewer { id } }" } };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), makeNullProvider());

      expect(result.fatalFailure).toBeNull();
      const response = result.response as { success: boolean; contentItems: { text: string }[] };
      expect(response.success).toBe(false);
      expect(response.contentItems[0].text).toContain("tracker is not configured for Linear");
    });
  });

  describe("tool dispatch — github_api", () => {
    it("dispatches github_api call when client is provided", async () => {
      const ghClient = mockGithubClient();
      const toolArgs = { action: "get_pr_status", owner: "org", repo: "repo", pullNumber: 1 };
      const params = { name: "github_api", arguments: toolArgs };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), makeNullProvider(), ghClient);

      expect(result.fatalFailure).toBeNull();
      expect(handleGithubApiToolCall).toHaveBeenCalledWith(ghClient, toolArgs);
    });

    it("returns tool error when github_api client is not configured", async () => {
      const params = {
        name: "github_api",
        arguments: { action: "get_pr_status", owner: "org", repo: "repo", pullNumber: 1 },
      };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), makeNullProvider());

      expect(result.fatalFailure).toBeNull();
      const response = result.response as { success: boolean; contentItems: { text: string }[] };
      expect(response.success).toBe(false);
      expect(response.contentItems[0].text).toContain("not configured");
    });

    it("dispatches github_api before consulting the tracker tool provider", async () => {
      const ghClient = mockGithubClient();
      const provider: TrackerToolProvider = {
        toolNames: ["github_api"],
        handleToolCall: vi.fn().mockResolvedValue({
          response: { success: true, contentItems: [{ type: "inputText", text: "wrong handler" }] },
          fatalFailure: null,
        }),
      };
      const toolArgs = { action: "get_pr_status", owner: "org", repo: "repo", pullNumber: 1 };

      await handleCodexRequest(
        makeRequest("item/tool/call", { name: "github_api", arguments: toolArgs }),
        provider,
        ghClient,
      );

      expect(handleGithubApiToolCall).toHaveBeenCalledWith(ghClient, toolArgs);
      expect(provider.handleToolCall).not.toHaveBeenCalled();
    });
  });

  describe("tool dispatch — unsupported tool", () => {
    it("returns tool error for unknown tool name", async () => {
      const params = { name: "unknown_tool", arguments: {} };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), makeNullProvider());

      expect(result.fatalFailure).toBeNull();
      const response = result.response as { success: boolean; contentItems: { text: string }[] };
      expect(response.success).toBe(false);
      expect(response.contentItems[0].text).toContain("unsupported dynamic tool");
    });

    it("reports 'unknown' when tool name is missing entirely", async () => {
      const result = await handleCodexRequest(makeRequest("item/tool/call", {}), makeNullProvider());

      const response = result.response as { success: boolean; contentItems: { text: string }[] };
      expect(response.success).toBe(false);
      expect(response.contentItems[0].text).toContain("unknown");
    });
  });

  describe("fatal failure classification", () => {
    it("gracefully skips user input request without fatal failure", async () => {
      const result = await handleCodexRequest(makeRequest("item/tool/requestUserInput"), makeNullProvider());
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ result: null });
    });

    it("marks MCP elicitation as startup_failed", async () => {
      const result = await handleCodexRequest(makeRequest("mcpServer/elicitation/request"), makeNullProvider());
      expect(result.fatalFailure).toEqual({
        code: "startup_failed",
        message: expect.stringContaining("MCP server"),
      });
    });

    it("marks chatgpt token refresh as auth_token_expired", async () => {
      const result = await handleCodexRequest(makeRequest("account/chatgptAuthTokens/refresh"), makeNullProvider());
      expect(result.fatalFailure).toEqual({
        code: "auth_token_expired",
        message: expect.stringContaining("auth token expired"),
      });
    });

    it("marks applyPatchApproval as startup_failed", async () => {
      const result = await handleCodexRequest(makeRequest("applyPatchApproval"), makeNullProvider());
      expect(result.fatalFailure?.code).toBe("startup_failed");
    });

    it("marks execCommandApproval as startup_failed", async () => {
      const result = await handleCodexRequest(makeRequest("execCommandApproval"), makeNullProvider());
      expect(result.fatalFailure?.code).toBe("startup_failed");
    });
  });

  describe("unsupported method fallback", () => {
    it("returns non-fatal JSON-RPC method-not-found error for unknown methods", async () => {
      const result = await handleCodexRequest(makeRequest("some/totally/unknown/method"), makeNullProvider());
      expect(result.fatalFailure).toBeNull();
      const response = result.response as { error: { code: number; message: string } };
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain("unknown request method");
    });

    it("includes the unknown method name in the error response", async () => {
      const result = await handleCodexRequest(makeRequest("custom/method"), makeNullProvider());
      expect(result.fatalFailure).toBeNull();
      const response = result.response as { error: { code: number; message: string } };
      expect(response.error.message).toContain("custom/method");
    });
  });
});
