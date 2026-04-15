import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { issueNotFound, methodNotAllowed, sanitizeConfigValue, refreshReason } from "../../src/http/route-helpers.js";

function makeResponse(): Response & { _status: number; _body: unknown; _headers: Record<string, string> } {
  const res = {
    _status: 200,
    _body: null as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._body = data;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name.toLowerCase()] = value;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown; _headers: Record<string, string> };
}

describe("issueNotFound", () => {
  it("returns 404 with the expected not-found payload", () => {
    const res = makeResponse();
    issueNotFound(res);

    expect(res._status).toBe(404);
    expect(res._body).toEqual({
      error: {
        code: "not_found",
        message: "Unknown issue identifier",
      },
    });
  });
});

describe("methodNotAllowed", () => {
  it("returns 405 with error JSON", () => {
    const res = makeResponse();
    methodNotAllowed(res);
    expect(res._status).toBe(405);
    expect((res._body as Record<string, { code: string }>).error.code).toBe("method_not_allowed");
    expect((res._body as Record<string, { message: string }>).error.message).toBe("Method Not Allowed");
  });

  it("sets Allow header with specified methods", () => {
    const res = makeResponse();
    methodNotAllowed(res, ["POST", "DELETE"]);
    expect(res._headers["allow"]).toBe("POST, DELETE");
    expect(res._status).toBe(405);
  });

  it("defaults Allow header to GET", () => {
    const res = makeResponse();
    methodNotAllowed(res);
    expect(res._headers["allow"]).toBe("GET");
  });
});

describe("sanitizeConfigValue", () => {
  it("redacts keys containing 'api_key'", () => {
    const result = sanitizeConfigValue({ api_key: "secret123" });
    expect(result).toEqual({ api_key: "[REDACTED]" });
  });

  it("redacts keys containing 'token'", () => {
    const result = sanitizeConfigValue({ access_token: "abc" });
    expect(result).toEqual({ access_token: "[REDACTED]" });
  });

  it("redacts keys containing 'secret'", () => {
    const result = sanitizeConfigValue({ client_secret: "xyz" });
    expect(result).toEqual({ client_secret: "[REDACTED]" });
  });

  it("redacts keys containing 'webhook'", () => {
    const result = sanitizeConfigValue({ webhookUrl: "https://hooks.slack.com/xxx" });
    expect(result).toEqual({ webhookUrl: "[REDACTED]" });
  });

  it("redacts keys containing 'password'", () => {
    const result = sanitizeConfigValue({ password: "hunter2" });
    expect(result).toEqual({ password: "[REDACTED]" });
  });

  it("does not redact safe keys", () => {
    const result = sanitizeConfigValue({ model: "gpt-4o", port: 4000 });
    expect(result).toEqual({ model: "gpt-4o", port: 4000 });
  });

  it("redacts nested values under sensitive branches like 'headers'", () => {
    const result = sanitizeConfigValue({
      http: { headers: { authorization: "Bearer xyz" } },
    });
    const http = (result as Record<string, unknown>).http as Record<string, unknown>;
    // The entire headers branch is redacted because 'headers' matches the sensitive-branch pattern
    expect(http.headers).toBe("[REDACTED]");
  });

  it("redacts singular sensitive branch names", () => {
    expect(sanitizeConfigValue({ http: { header: { value: "hello" } } })).toEqual({
      http: { header: "[REDACTED]" },
    });
    expect(sanitizeConfigValue({ config: { credential: { value: "hello" } } })).toEqual({
      config: { credential: "[REDACTED]" },
    });
  });

  it("handles arrays recursively", () => {
    const result = sanitizeConfigValue({ items: [{ name: "ok" }, { apiKey: "secret" }] });
    const items = (result as Record<string, unknown[]>).items;
    expect((items[0] as Record<string, string>).name).toBe("ok");
    expect((items[1] as Record<string, string>).apiKey).toBe("[REDACTED]");
  });

  it("handles empty objects and arrays", () => {
    expect(sanitizeConfigValue({})).toEqual({});
    expect(sanitizeConfigValue([])).toEqual([]);
  });

  it("returns primitives unchanged for non-sensitive paths", () => {
    expect(sanitizeConfigValue("hello")).toBe("hello");
    expect(sanitizeConfigValue(42)).toBe(42);
    expect(sanitizeConfigValue(true)).toBe(true);
    expect(sanitizeConfigValue(null)).toBe(null);
  });

  it("redacts safe keys when the parent path is already sensitive", () => {
    expect(sanitizeConfigValue({ nested: "hello" }, ["headers"])).toEqual({ nested: "[REDACTED]" });
    expect(sanitizeConfigValue({ nested: "hello" }, ["secret"])).toEqual({ nested: "[REDACTED]" });
    expect(sanitizeConfigValue({ nested: "hello" }, ["token"])).toEqual({ nested: "[REDACTED]" });
  });

  it("redacts array items when the inherited path is already sensitive", () => {
    expect(sanitizeConfigValue(["hello"])).toEqual(["hello"]);
    expect(sanitizeConfigValue(["hello"], ["headers"])).toEqual(["[REDACTED]"]);
  });
});

describe("refreshReason", () => {
  it("returns custom header when present", () => {
    const req = { get: vi.fn().mockReturnValue("manual_trigger") } as unknown as Request;
    expect(refreshReason(req)).toBe("manual_trigger");
    expect(req.get).toHaveBeenCalledWith("x-risoluto-reason");
  });

  it("returns default when header is absent", () => {
    const req = { get: vi.fn().mockReturnValue(undefined) } as unknown as Request;
    expect(refreshReason(req)).toBe("http_refresh");
  });
});
