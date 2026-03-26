import { describe, expect, it } from "vitest";

import {
  createErrorResponse,
  createRequest,
  createSuccessResponse,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcSuccessResponse,
} from "../../src/codex/protocol.js";

describe("createRequest", () => {
  it("returns a valid JSON-RPC 2.0 request with method and params", () => {
    const request = createRequest("test/method", { key: "value" });

    expect(request.jsonrpc).toBe("2.0");
    expect(request.method).toBe("test/method");
    expect(request.params).toEqual({ key: "value" });
    expect(typeof request.id).toBe("number");
  });

  it("increments the id on each call", () => {
    const first = createRequest("a", null);
    const second = createRequest("b", null);

    expect(second.id).toBe((first.id as number) + 1);
  });

  it("accepts null params", () => {
    const request = createRequest("ping", null);
    expect(request.params).toBeNull();
  });

  it("accepts complex params", () => {
    const params = { nested: { list: [1, 2, 3] }, flag: true };
    const request = createRequest("complex", params);
    expect(request.params).toEqual(params);
  });
});

describe("createSuccessResponse", () => {
  it("returns a valid JSON-RPC 2.0 success response", () => {
    const response = createSuccessResponse(42, { data: "ok" });

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 42,
      result: { data: "ok" },
    });
  });

  it("accepts a string id", () => {
    const response = createSuccessResponse("req-1", "done");
    expect(response.id).toBe("req-1");
    expect(response.result).toBe("done");
  });

  it("accepts null result", () => {
    const response = createSuccessResponse(1, null);
    expect(response.result).toBeNull();
  });
});

describe("createErrorResponse", () => {
  it("returns a valid JSON-RPC 2.0 error response with code -32000", () => {
    const response = createErrorResponse(7, "something went wrong");

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 7,
      error: {
        code: -32000,
        message: "something went wrong",
      },
    });
  });

  it("accepts a string id", () => {
    const response = createErrorResponse("err-id", "fail");
    expect(response.id).toBe("err-id");
  });
});

describe("isJsonRpcRequest", () => {
  it("returns true for a valid request object", () => {
    expect(isJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "test", params: {} })).toBe(true);
  });

  it("returns true when params is missing (only method + id required)", () => {
    expect(isJsonRpcRequest({ id: 1, method: "test" })).toBe(true);
  });

  it("returns false when id is missing (that is a notification)", () => {
    expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "test" })).toBe(false);
  });

  it("returns false when method is missing", () => {
    expect(isJsonRpcRequest({ jsonrpc: "2.0", id: 1 })).toBe(false);
  });

  it("returns false when method is not a string", () => {
    expect(isJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: 42 })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isJsonRpcRequest(null)).toBe(false);
  });

  it("returns false for a primitive", () => {
    expect(isJsonRpcRequest("hello")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isJsonRpcRequest(undefined)).toBe(false);
  });
});

describe("isJsonRpcNotification", () => {
  it("returns true for a valid notification (method present, no id)", () => {
    expect(isJsonRpcNotification({ jsonrpc: "2.0", method: "update", params: {} })).toBe(true);
  });

  it("returns true when params is missing", () => {
    expect(isJsonRpcNotification({ jsonrpc: "2.0", method: "ping" })).toBe(true);
  });

  it("returns false when id is present (that is a request)", () => {
    expect(isJsonRpcNotification({ jsonrpc: "2.0", id: 1, method: "test" })).toBe(false);
  });

  it("returns false when method is missing", () => {
    expect(isJsonRpcNotification({ jsonrpc: "2.0" })).toBe(false);
  });

  it("returns false when method is not a string", () => {
    expect(isJsonRpcNotification({ jsonrpc: "2.0", method: 123 })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isJsonRpcNotification(null)).toBe(false);
  });
});

describe("isJsonRpcSuccessResponse", () => {
  it("returns true when id and result are present", () => {
    expect(isJsonRpcSuccessResponse({ jsonrpc: "2.0", id: 1, result: "ok" })).toBe(true);
  });

  it("returns true even with null result (key is present)", () => {
    expect(isJsonRpcSuccessResponse({ jsonrpc: "2.0", id: 1, result: null })).toBe(true);
  });

  it("returns false when result is missing", () => {
    expect(isJsonRpcSuccessResponse({ jsonrpc: "2.0", id: 1 })).toBe(false);
  });

  it("returns false when id is missing", () => {
    expect(isJsonRpcSuccessResponse({ jsonrpc: "2.0", result: "ok" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isJsonRpcSuccessResponse(null)).toBe(false);
  });

  it("returns false for a primitive", () => {
    expect(isJsonRpcSuccessResponse(42)).toBe(false);
  });
});

describe("isJsonRpcErrorResponse", () => {
  it("returns true when id and error are present", () => {
    expect(
      isJsonRpcErrorResponse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "fail" },
      }),
    ).toBe(true);
  });

  it("returns false when error is missing", () => {
    expect(isJsonRpcErrorResponse({ jsonrpc: "2.0", id: 1 })).toBe(false);
  });

  it("returns false when id is missing", () => {
    expect(
      isJsonRpcErrorResponse({
        jsonrpc: "2.0",
        error: { code: -32000, message: "fail" },
      }),
    ).toBe(false);
  });

  it("returns false for null", () => {
    expect(isJsonRpcErrorResponse(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isJsonRpcErrorResponse(undefined)).toBe(false);
  });
});
