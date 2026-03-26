import { describe, expect, it } from "vitest";

import {
  getRequestId,
  resolveRequestId,
  REQUEST_ID_HEADER,
  runWithRequestContext,
} from "../../src/observability/tracing.js";

describe("resolveRequestId", () => {
  it("generates a UUID when no X-Request-ID is present", () => {
    const id = resolveRequestId(undefined);
    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("preserves an incoming X-Request-ID", () => {
    const id = resolveRequestId("trace-abc-123");
    expect(id).toBe("trace-abc-123");
  });

  it("generates a new UUID when header is empty string", () => {
    const id = resolveRequestId("");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("exports the expected header name", () => {
    expect(REQUEST_ID_HEADER).toBe("X-Request-ID");
  });

  it("stores the request id in async context", async () => {
    await runWithRequestContext("req-xyz", async () => {
      await Promise.resolve();
      expect(getRequestId()).toBe("req-xyz");
    });

    expect(getRequestId()).toBeNull();
  });
});
