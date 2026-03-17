import { asRecord, asString } from "../agent-runner-helpers.js";
import type { GithubApiToolClient } from "../github-api-tool.js";
import { handleGithubApiToolCall } from "../github-api-tool.js";
import type { LinearClient } from "../linear-client.js";
import { handleLinearGraphqlToolCall } from "../linear-graphql-tool.js";
import type { JsonRpcRequest } from "../codex-protocol.js";

export interface CodexRequestResult {
  response?: unknown;
  fatalFailure: { code: string; message: string } | null;
}

export async function handleCodexRequest(
  request: JsonRpcRequest,
  linearClient: LinearClient,
  githubToolClient?: GithubApiToolClient,
): Promise<CodexRequestResult> {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
      return {
        response: {
          decision: "acceptForSession",
        },
        fatalFailure: null,
      };
    case "item/permissions/requestApproval": {
      const params = asRecord(request.params);
      return {
        response: {
          permissions: params.permissionProfile ?? params.permissions ?? null,
          scope: "session",
        },
        fatalFailure: null,
      };
    }
    case "item/tool/call": {
      const params = asRecord(request.params);
      const toolName = asString(params.name) ?? asString(params.toolName);
      if (toolName === "linear_graphql") {
        const response = await handleLinearGraphqlToolCall(
          linearClient,
          params.arguments ?? params.args ?? params.input ?? null,
        );
        return { response, fatalFailure: null };
      }
      if (toolName === "github_api") {
        if (!githubToolClient) {
          return {
            response: {
              success: false,
              contentItems: [
                {
                  type: "inputText",
                  text: JSON.stringify({
                    error: "github_api is not configured",
                  }),
                },
              ],
            },
            fatalFailure: null,
          };
        }
        const response = await handleGithubApiToolCall(
          githubToolClient,
          params.arguments ?? params.args ?? params.input ?? null,
        );
        return { response, fatalFailure: null };
      }
      return {
        response: {
          success: false,
          contentItems: [
            {
              type: "inputText",
              text: JSON.stringify({
                error: `unsupported dynamic tool: ${toolName ?? "unknown"}`,
              }),
            },
          ],
        },
        fatalFailure: null,
      };
    }
    case "item/tool/requestUserInput":
      return {
        fatalFailure: {
          code: "turn_input_required",
          message: "codex requested interactive user input, which Symphony does not support",
        },
      };
    case "mcpServer/elicitation/request":
      return {
        fatalFailure: {
          code: "startup_failed",
          message: "thread/start failed because a required MCP server did not initialize",
        },
      };
    case "account/chatgptAuthTokens/refresh":
    case "applyPatchApproval":
    case "execCommandApproval":
      return {
        fatalFailure: {
          code: "startup_failed",
          message: `unsupported interactive request from codex: ${request.method}`,
        },
      };
    default:
      return {
        fatalFailure: {
          code: "startup_failed",
          message: `unsupported codex request method: ${request.method}`,
        },
      };
  }
}
