import { describe, expect, it, vi } from "vitest";

import { handleLinearGraphqlToolCall } from "../src/linear-graphql-tool.js";
import { LinearClient } from "../src/linear-client.js";

describe("handleLinearGraphqlToolCall", () => {
  it("returns the required wire shape for a valid single operation", async () => {
    const client = {
      runGraphQL: vi.fn(async () => ({ data: { viewer: { id: "123" } } })),
    } as unknown as LinearClient;

    const response = await handleLinearGraphqlToolCall(client, {
      query: "query One { viewer { id } }",
    });

    expect(response.success).toBe(true);
    expect(response.contentItems).toHaveLength(1);
    expect(response.contentItems[0]).toEqual({
      type: "inputText",
      text: JSON.stringify({ data: { viewer: { id: "123" } } }),
    });
  });

  it("rejects documents with more than one operation", async () => {
    const client = {
      runGraphQL: vi.fn(),
    } as unknown as LinearClient;

    const response = await handleLinearGraphqlToolCall(
      client,
      "query One { viewer { id } } query Two { teams { nodes { id } } }",
    );

    expect(response.success).toBe(false);
    expect(JSON.parse(response.contentItems[0].text)).toEqual({
      error: "linear_graphql requires exactly one operation",
    });
  });

  it("returns success=false when the GraphQL payload contains top-level errors", async () => {
    const client = {
      runGraphQL: vi.fn(async () => ({ data: null, errors: [{ message: "boom" }] })),
    } as unknown as LinearClient;

    const response = await handleLinearGraphqlToolCall(client, {
      query: "query One { viewer { id } }",
    });

    expect(response.success).toBe(false);
    expect(JSON.parse(response.contentItems[0].text)).toEqual({
      data: null,
      errors: [{ message: "boom" }],
    });
  });
});
