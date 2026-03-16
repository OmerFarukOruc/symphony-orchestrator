import { describe, expect, it, vi } from "vitest";

import { tracingMiddleware, getRequestId, REQUEST_ID_HEADER } from "../src/tracing.js";

function createMockReqRes(incomingId?: string) {
  const req = {
    get: vi.fn((header: string) => (header === REQUEST_ID_HEADER ? incomingId : undefined)),
  } as unknown as Parameters<typeof tracingMiddleware>[0];

  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
  } as unknown as Parameters<typeof tracingMiddleware>[1];

  return { req, res, headers };
}

describe("tracing middleware", () => {
  it("generates a UUID when no X-Request-ID is present", () => {
    const { req, res, headers } = createMockReqRes();
    const next = vi.fn();

    tracingMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(headers[REQUEST_ID_HEADER]).toBeDefined();
    expect(headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getRequestId(req)).toBe(headers[REQUEST_ID_HEADER]);
  });

  it("preserves an incoming X-Request-ID", () => {
    const { req, res, headers } = createMockReqRes("trace-abc-123");
    const next = vi.fn();

    tracingMiddleware(req, res, next);

    expect(headers[REQUEST_ID_HEADER]).toBe("trace-abc-123");
    expect(getRequestId(req)).toBe("trace-abc-123");
  });

  it("getRequestId returns 'unknown' on a raw request", () => {
    const req = {} as Parameters<typeof getRequestId>[0];
    expect(getRequestId(req)).toBe("unknown");
  });
});
