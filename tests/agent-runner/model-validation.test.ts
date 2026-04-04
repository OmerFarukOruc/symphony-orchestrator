import { describe, expect, it, vi } from "vitest";

import { fetchAvailableModels } from "../../src/agent-runner/model-validation.js";
import { createMockLogger } from "../helpers.js";

function makeConnection(requestImpl: (...args: unknown[]) => Promise<unknown>) {
  return {
    request: vi.fn(requestImpl),
  } as unknown as import("../../src/agent/json-rpc-connection.js").JsonRpcConnection;
}

describe("fetchAvailableModels", () => {
  const logger = createMockLogger();

  it("returns model ids from a well-formed model/list response", async () => {
    const conn = makeConnection(async () => ({
      data: [{ id: "gpt-5.4" }, { id: "o3" }],
    }));

    const result = await fetchAvailableModels(conn, logger);

    expect(result).toEqual(["gpt-5.4", "o3"]);
    expect(conn.request).toHaveBeenCalledWith("model/list", { limit: 100 });
  });

  it("follows paginated model/list responses", async () => {
    const conn = makeConnection(async (_method, params) => {
      const record = params as { cursor?: string };
      if (!record.cursor) {
        return { data: [{ id: "gpt-5.4" }], nextCursor: "page-2" };
      }
      return { data: [{ id: "o3" }], nextCursor: null };
    });

    const result = await fetchAvailableModels(conn, logger);

    expect(result).toEqual(["gpt-5.4", "o3"]);
    expect(conn.request).toHaveBeenNthCalledWith(1, "model/list", { limit: 100 });
    expect(conn.request).toHaveBeenNthCalledWith(2, "model/list", { cursor: "page-2", limit: 100 });
  });

  it("returns null and logs a warning when connection throws", async () => {
    const conn = makeConnection(async () => {
      throw new Error("method not found");
    });

    const result = await fetchAvailableModels(conn, logger);

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith("model/list unavailable — skipping model validation");
  });

  it("returns null when models field is not an array", async () => {
    const conn = makeConnection(async () => ({
      models: "not-an-array",
    }));

    const result = await fetchAvailableModels(conn, logger);

    expect(result).toBeNull();
  });

  it("returns an empty array when models is an empty array", async () => {
    const conn = makeConnection(async () => ({
      models: [],
    }));

    const result = await fetchAvailableModels(conn, logger);

    expect(result).toEqual([]);
  });

  it("filters out entries with missing id field", async () => {
    const conn = makeConnection(async () => ({
      models: [{ id: "gpt-5.4" }, { name: "no-id-model" }, { id: "o3" }],
    }));

    const result = await fetchAvailableModels(conn, logger);

    expect(result).toEqual(["gpt-5.4", "o3"]);
  });

  it("returns null when result has no models field", async () => {
    const conn = makeConnection(async () => ({
      other: "data",
    }));

    const result = await fetchAvailableModels(conn, logger);

    expect(result).toBeNull();
  });
});
