import { Kind, parse } from "graphql";

import { LinearClient } from "./client.js";

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

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

export async function handleLinearGraphqlToolCall(
  client: LinearClient,
  args: unknown,
): Promise<{ success: boolean; contentItems: Array<{ type: "inputText"; text: string }> }> {
  try {
    const input = extractInput(args);
    const document = parse(input.query);
    const operationCount = document.definitions.filter(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    ).length;

    if (operationCount !== 1) {
      throw new Error("linear_graphql requires exactly one operation");
    }

    const response = await client.runGraphQL(input.query, input.variables);
    if (Array.isArray(response.errors) && response.errors.length > 0) {
      return {
        success: false,
        contentItems: [
          {
            type: "inputText",
            text: jsonText(response),
          },
        ],
      };
    }
    return {
      success: true,
      contentItems: [
        {
          type: "inputText",
          text: jsonText(response),
        },
      ],
    };
  } catch (error) {
    return {
      success: false,
      contentItems: [
        {
          type: "inputText",
          text: jsonText({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
    };
  }
}
