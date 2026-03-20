import { LinearClient } from "./client.js";
import {
  type ToolCallResult,
  toolCallSuccess,
  toolCallFailure,
  toolCallErrorPayload,
} from "../utils/tool-call-result.js";

function extractInput(args: unknown): { query: string; variables?: Record<string, unknown> } {
  if (typeof args === "string") {
    return { query: args };
  }
  if (typeof args === "object" && args !== null && !Array.isArray(args)) {
    const record = args as Record<string, unknown>;
    if (typeof record.query === "string") {
      return {
        query: record.query,
        variables:
          typeof record.variables === "object" && record.variables !== null && !Array.isArray(record.variables)
            ? (record.variables as Record<string, unknown>)
            : undefined,
      };
    }
  }
  throw new Error("linear_graphql expects a query string or { query, variables } object");
}

function countOperations(query: string): number {
  const operationKeywords = /\b(query|mutation|subscription)\b/gi;
  let count = 0;
  while (operationKeywords.exec(query) !== null) {
    count++;
  }
  return count;
}

export async function handleLinearGraphqlToolCall(client: LinearClient, args: unknown): Promise<ToolCallResult> {
  try {
    const input = extractInput(args);
    const operationCount = countOperations(input.query);

    if (operationCount !== 1) {
      throw new Error("linear_graphql requires exactly one operation");
    }

    const response = await client.runGraphQL(input.query, input.variables);
    if (Array.isArray(response.errors) && response.errors.length > 0) {
      return toolCallErrorPayload(response);
    }
    return toolCallSuccess(response);
  } catch (error) {
    return toolCallFailure(error);
  }
}
