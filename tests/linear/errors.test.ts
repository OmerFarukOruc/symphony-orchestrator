import { describe, expect, it } from "vitest";

import { LinearClientError } from "../../src/linear/errors.js";

describe("LinearClientError", () => {
  it("sets the code property", () => {
    const error = new LinearClientError("linear_http_error", "HTTP 500");
    expect(error.code).toBe("linear_http_error");
  });

  it("sets the message property", () => {
    const error = new LinearClientError("linear_transport_error", "Connection refused");
    expect(error.message).toBe("Connection refused");
  });

  it("sets name to LinearClientError", () => {
    const error = new LinearClientError("linear_graphql_error", "field not found");
    expect(error.name).toBe("LinearClientError");
  });

  it("is an instance of Error", () => {
    const error = new LinearClientError("linear_unknown_payload", "unexpected shape");
    expect(error).toBeInstanceOf(Error);
  });

  it("is an instance of LinearClientError", () => {
    const error = new LinearClientError("linear_missing_end_cursor", "no cursor");
    expect(error).toBeInstanceOf(LinearClientError);
  });

  it("supports the cause option for error chaining", () => {
    const cause = new Error("root cause");
    const error = new LinearClientError("linear_transport_error", "wrapper", { cause });
    expect(error.cause).toBe(cause);
  });

  it("has no cause when options are omitted", () => {
    const error = new LinearClientError("linear_http_error", "bad request");
    expect(error.cause).toBeUndefined();
  });

  it("produces a useful stack trace", () => {
    const error = new LinearClientError("linear_graphql_error", "parse error");
    expect(error.stack).toBeTypeOf("string");
    expect(error.stack).toContain("LinearClientError");
    expect(error.stack).toContain("parse error");
  });

  it("works with each error code", () => {
    const codes = [
      "linear_transport_error",
      "linear_http_error",
      "linear_graphql_error",
      "linear_unknown_payload",
      "linear_missing_end_cursor",
    ] as const;

    for (const code of codes) {
      const error = new LinearClientError(code, `test ${code}`);
      expect(error.code).toBe(code);
      expect(error.message).toBe(`test ${code}`);
      expect(error.name).toBe("LinearClientError");
    }
  });
});
