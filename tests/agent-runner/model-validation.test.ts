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
      models: [{ id: "gpt-5.4" }, { id: "o3" }],
    }));

    const result = await fetchAvailableModels(conn, logger);

    expect(result).toEqual(["gpt-5.4", "o3"]);
    expect(conn.request).toHaveBeenCalledWith("model/list", {});
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
