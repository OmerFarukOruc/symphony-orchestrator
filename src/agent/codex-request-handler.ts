import { asRecord, asStringOrNull as asString } from "../utils/type-guards.js";
import type { GithubApiToolClient } from "../git/github-api-tool.js";
import { handleGithubApiToolCall } from "../git/github-api-tool.js";
import type { LinearClient } from "../linear/client.js";
import { handleLinearGraphqlToolCall } from "../linear/graphql-tool.js";
import type { JsonRpcRequest } from "../codex/protocol.js";

interface CodexRequestResult {
  response?: unknown;
  fatalFailure: { code: string; message: string } | null;
}

function fatalResult(code: string, message: string): CodexRequestResult {
  return { fatalFailure: { code, message } };
}

function toolErrorResponse(errorMessage: string): CodexRequestResult {
  return {
    response: {
      success: false,
      contentItems: [{ type: "inputText", text: JSON.stringify({ error: errorMessage }) }],
    },
    fatalFailure: null,
  };
}

async function handleToolCall(
  params: Record<string, unknown>,
  linearClient: LinearClient | null,
  githubToolClient?: GithubApiToolClient,
): Promise<CodexRequestResult> {
  const toolName = asString(params.name) ?? asString(params.toolName);
  const toolArgs = params.arguments ?? params.args ?? params.input ?? null;

  if (toolName === "linear_graphql") {
    if (!linearClient) {
      return toolErrorResponse("linear_graphql is not available: tracker is not configured for Linear");
    }
    const response = await handleLinearGraphqlToolCall(linearClient, toolArgs);
    return { response, fatalFailure: null };
  }
  if (toolName === "github_api") {
    if (!githubToolClient) {
      return toolErrorResponse("github_api is not configured");
    }
    const response = await handleGithubApiToolCall(githubToolClient, toolArgs);
    return { response, fatalFailure: null };
  }
  return toolErrorResponse(`unsupported dynamic tool: ${toolName ?? "unknown"}`);
}

export async function handleCodexRequest(
  request: JsonRpcRequest,
  linearClient: LinearClient | null,
  githubToolClient?: GithubApiToolClient,
): Promise<CodexRequestResult> {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
      return { response: { decision: "acceptForSession" }, fatalFailure: null };
    case "item/permissions/requestApproval": {
      const params = asRecord(request.params);
      return {
        response: { permissions: params.permissionProfile ?? params.permissions ?? null, scope: "session" },
        fatalFailure: null,
      };
    }
    case "item/tool/call":
      return handleToolCall(asRecord(request.params), linearClient, githubToolClient);
    case "item/tool/requestUserInput":
      return {
        response: { result: null },
        fatalFailure: null,
      };
    case "mcpServer/elicitation/request":
      return fatalResult("startup_failed", "thread/start failed because a required MCP server did not initialize");
    case "account/chatgptAuthTokens/refresh":
      return fatalResult("auth_token_expired", "ChatGPT auth token expired and Risoluto cannot refresh it");
    case "applyPatchApproval":
    case "execCommandApproval":
      return fatalResult("startup_failed", `unsupported interactive request from codex: ${request.method}`);
    default:
      return {
        response: { error: { code: -32601, message: `unknown request method: ${request.method}` } },
        fatalFailure: null,
      };
  }
}
