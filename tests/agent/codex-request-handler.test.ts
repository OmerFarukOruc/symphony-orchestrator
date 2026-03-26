import { describe, expect, it, vi } from "vitest";

import { handleCodexRequest } from "../../src/agent/codex-request-handler.js";
import type { JsonRpcRequest } from "../../src/codex/protocol.js";
import type { GithubApiToolClient } from "../../src/git/github-api-tool.js";
import type { LinearClient } from "../../src/linear/client.js";

vi.mock("../../src/linear/graphql-tool.js", () => ({
  handleLinearGraphqlToolCall: vi.fn().mockResolvedValue({ success: true, contentItems: [] }),
}));

vi.mock("../../src/git/github-api-tool.js", () => ({
  handleGithubApiToolCall: vi.fn().mockResolvedValue({ success: true, contentItems: [] }),
}));

const { handleLinearGraphqlToolCall } = await import("../../src/linear/graphql-tool.js");
const { handleGithubApiToolCall } = await import("../../src/git/github-api-tool.js");

function makeRequest(method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params };
}

function mockLinearClient(): LinearClient {
  return {} as unknown as LinearClient;
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
      const result = await handleCodexRequest(makeRequest("item/commandExecution/requestApproval"), mockLinearClient());
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ decision: "acceptForSession" });
    });

    it("accepts fileChange approval for session", async () => {
      const result = await handleCodexRequest(makeRequest("item/fileChange/requestApproval"), mockLinearClient());
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ decision: "acceptForSession" });
    });

    it("echoes back permissionProfile for permissions approval", async () => {
      const params = { permissionProfile: "full-auto" };
      const result = await handleCodexRequest(
        makeRequest("item/permissions/requestApproval", params),
        mockLinearClient(),
      );
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ permissions: "full-auto", scope: "session" });
    });

    it("falls back to permissions field when permissionProfile is absent", async () => {
      const params = { permissions: { read: true, write: true } };
      const result = await handleCodexRequest(
        makeRequest("item/permissions/requestApproval", params),
        mockLinearClient(),
      );
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({
        permissions: { read: true, write: true },
        scope: "session",
      });
    });

    it("returns null permissions when neither field is present", async () => {
      const result = await handleCodexRequest(makeRequest("item/permissions/requestApproval", {}), mockLinearClient());
      expect(result.response).toEqual({ permissions: null, scope: "session" });
    });

    it("handles non-object params gracefully for permissions approval", async () => {
      const result = await handleCodexRequest(
        makeRequest("item/permissions/requestApproval", "not-an-object"),
        mockLinearClient(),
      );
      expect(result.fatalFailure).toBeNull();
      expect(result.response).toEqual({ permissions: null, scope: "session" });
    });
  });

  describe("tool dispatch — linear_graphql", () => {
    it("dispatches linear_graphql call via name param", async () => {
      const client = mockLinearClient();
      const params = { name: "linear_graphql", arguments: { query: "{ viewer { id } }" } };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), client);

      expect(result.fatalFailure).toBeNull();
      expect(result.response).toBeDefined();
      expect(handleLinearGraphqlToolCall).toHaveBeenCalledWith(client, { query: "{ viewer { id } }" });
    });

    it("dispatches linear_graphql call via toolName param", async () => {
      const client = mockLinearClient();
      const params = { toolName: "linear_graphql", args: "{ viewer { id } }" };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), client);

      expect(result.fatalFailure).toBeNull();
      expect(handleLinearGraphqlToolCall).toHaveBeenCalledWith(client, "{ viewer { id } }");
    });
  });

  describe("tool dispatch — github_api", () => {
    it("dispatches github_api call when client is provided", async () => {
      const ghClient = mockGithubClient();
      const toolArgs = { action: "get_pr_status", owner: "org", repo: "repo", pullNumber: 1 };
      const params = { name: "github_api", arguments: toolArgs };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), mockLinearClient(), ghClient);

      expect(result.fatalFailure).toBeNull();
      expect(handleGithubApiToolCall).toHaveBeenCalledWith(ghClient, toolArgs);
    });

    it("returns tool error when github_api client is not configured", async () => {
      const params = {
        name: "github_api",
        arguments: { action: "get_pr_status", owner: "org", repo: "repo", pullNumber: 1 },
      };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), mockLinearClient());

      expect(result.fatalFailure).toBeNull();
      const response = result.response as { success: boolean; contentItems: { text: string }[] };
      expect(response.success).toBe(false);
      expect(response.contentItems[0].text).toContain("not configured");
    });
  });

  describe("tool dispatch — unsupported tool", () => {
    it("returns tool error for unknown tool name", async () => {
      const params = { name: "unknown_tool", arguments: {} };
      const result = await handleCodexRequest(makeRequest("item/tool/call", params), mockLinearClient());

      expect(result.fatalFailure).toBeNull();
      const response = result.response as { success: boolean; contentItems: { text: string }[] };
      expect(response.success).toBe(false);
      expect(response.contentItems[0].text).toContain("unsupported dynamic tool");
    });

    it("reports 'unknown' when tool name is missing entirely", async () => {
      const result = await handleCodexRequest(makeRequest("item/tool/call", {}), mockLinearClient());

      const response = result.response as { success: boolean; contentItems: { text: string }[] };
      expect(response.success).toBe(false);
      expect(response.contentItems[0].text).toContain("unknown");
    });
  });

  describe("fatal failure classification", () => {
    it("marks user input request as turn_input_required", async () => {
      const result = await handleCodexRequest(makeRequest("item/tool/requestUserInput"), mockLinearClient());
      expect(result.fatalFailure).toEqual({
        code: "turn_input_required",
        message: expect.stringContaining("interactive user input"),
      });
      expect(result.response).toBeUndefined();
    });

    it("marks MCP elicitation as startup_failed", async () => {
      const result = await handleCodexRequest(makeRequest("mcpServer/elicitation/request"), mockLinearClient());
      expect(result.fatalFailure).toEqual({
        code: "startup_failed",
        message: expect.stringContaining("MCP server"),
      });
    });

    it("marks chatgpt token refresh as startup_failed", async () => {
      const result = await handleCodexRequest(makeRequest("account/chatgptAuthTokens/refresh"), mockLinearClient());
      expect(result.fatalFailure).toEqual({
        code: "startup_failed",
        message: expect.stringContaining("unsupported interactive request"),
      });
    });

    it("marks applyPatchApproval as startup_failed", async () => {
      const result = await handleCodexRequest(makeRequest("applyPatchApproval"), mockLinearClient());
      expect(result.fatalFailure?.code).toBe("startup_failed");
    });

    it("marks execCommandApproval as startup_failed", async () => {
      const result = await handleCodexRequest(makeRequest("execCommandApproval"), mockLinearClient());
      expect(result.fatalFailure?.code).toBe("startup_failed");
    });
  });

  describe("unsupported method fallback", () => {
    it("returns startup_failed for completely unknown methods", async () => {
      const result = await handleCodexRequest(makeRequest("some/totally/unknown/method"), mockLinearClient());
      expect(result.fatalFailure).toEqual({
        code: "startup_failed",
        message: expect.stringContaining("unsupported codex request method"),
      });
    });

    it("includes the unknown method name in the error message", async () => {
      const result = await handleCodexRequest(makeRequest("custom/method"), mockLinearClient());
      expect(result.fatalFailure?.message).toContain("custom/method");
    });
  });
});
