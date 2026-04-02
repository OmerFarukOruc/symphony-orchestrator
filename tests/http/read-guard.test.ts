import { afterEach, describe, expect, it, vi } from "vitest";

import { createReadGuard } from "../../src/http/read-guard.js";

function createResponse() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return response;
}

describe("createReadGuard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows protected reads from loopback without a token", () => {
    const next = vi.fn();
    const response = createResponse();
    const request = {
      method: "GET",
      path: "/api/v1/state",
      socket: { remoteAddress: "127.0.0.1" },
      get: vi.fn().mockReturnValue(undefined),
      query: {},
    };

    createReadGuard()(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("rejects protected reads from remote addresses without configured tokens", () => {
    const next = vi.fn();
    const response = createResponse();
    const request = {
      method: "GET",
      path: "/api/v1/state",
      // eslint-disable-next-line sonarjs/no-hardcoded-ip -- non-loopback regression coverage
      socket: { remoteAddress: "192.168.1.10" },
      get: vi.fn().mockReturnValue(undefined),
      query: {},
    };

    createReadGuard()(request as never, response as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("allows protected reads with RISOLUTO_READ_TOKEN via bearer auth", () => {
    vi.stubEnv("RISOLUTO_READ_TOKEN", "read-secret");
    const next = vi.fn();
    const response = createResponse();
    const request = {
      method: "GET",
      path: "/api/v1/state",
      // eslint-disable-next-line sonarjs/no-hardcoded-ip -- non-loopback regression coverage
      socket: { remoteAddress: "192.168.1.10" },
      get: vi
        .fn()
        .mockImplementation((header: string) => (header === "authorization" ? "Bearer read-secret" : undefined)),
      query: {},
    };

    createReadGuard()(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("allows protected reads with RISOLUTO_READ_TOKEN via query token", () => {
    vi.stubEnv("RISOLUTO_READ_TOKEN", "read-secret");
    const next = vi.fn();
    const response = createResponse();
    const request = {
      method: "GET",
      path: "/api/v1/events",
      // eslint-disable-next-line sonarjs/no-hardcoded-ip -- non-loopback regression coverage
      socket: { remoteAddress: "10.0.0.5" },
      get: vi.fn().mockReturnValue(undefined),
      query: { read_token: "read-secret" },
    };

    createReadGuard()(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("rejects query-string auth when only RISOLUTO_WRITE_TOKEN is configured", () => {
    vi.stubEnv("RISOLUTO_WRITE_TOKEN", "write-secret");
    const next = vi.fn();
    const response = createResponse();
    const request = {
      method: "GET",
      path: "/api/v1/events",
      // eslint-disable-next-line sonarjs/no-hardcoded-ip -- non-loopback regression coverage
      socket: { remoteAddress: "10.0.0.5" },
      get: vi.fn().mockReturnValue(undefined),
      query: { read_token: "write-secret" },
    };

    createReadGuard()(request as never, response as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("skips public runtime and setup reads", () => {
    const next = vi.fn();
    const response = createResponse();
    const request = {
      method: "GET",
      path: "/api/v1/runtime",
      socket: { remoteAddress: "203.0.113.10" },
      get: vi.fn().mockReturnValue(undefined),
      query: {},
    };

    createReadGuard()(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });
});
