import { describe, expect, it, vi } from "vitest";

import { LinearTrackerToolProvider } from "../../src/linear/tool-provider.js";

const handleLinearGraphqlToolCall = vi.fn();

vi.mock("../../src/linear/graphql-tool.js", () => ({
  handleLinearGraphqlToolCall: (...args: unknown[]) => handleLinearGraphqlToolCall(...args),
}));

describe("LinearTrackerToolProvider", () => {
  it("exposes the linear_graphql tool name", () => {
    const provider = new LinearTrackerToolProvider({} as never);
    expect(provider.toolNames).toEqual(["linear_graphql"]);
  });

  it("returns null for unsupported tool names", async () => {
    const provider = new LinearTrackerToolProvider({} as never);
    await expect(provider.handleToolCall("other_tool", {})).resolves.toBeNull();
    expect(handleLinearGraphqlToolCall).not.toHaveBeenCalled();
  });

  it("delegates supported tool calls to the graphql tool handler", async () => {
    handleLinearGraphqlToolCall.mockResolvedValueOnce({ ok: true, data: { hello: "world" } });
    const client = { runGraphQL: vi.fn() } as never;
    const provider = new LinearTrackerToolProvider(client);

    await expect(provider.handleToolCall("linear_graphql", { query: "query Test { viewer { id } }" })).resolves.toEqual(
      {
        response: { ok: true, data: { hello: "world" } },
        fatalFailure: null,
      },
    );
    expect(handleLinearGraphqlToolCall).toHaveBeenCalledWith(client, { query: "query Test { viewer { id } }" });
  });
});
