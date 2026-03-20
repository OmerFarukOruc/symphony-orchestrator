import { describe, it, expect } from "vitest";
import { bearerAuth } from "../../src/dispatch/auth.js";
import type { Request, Response } from "express";

describe("bearerAuth middleware", () => {
  const secret = "test-secret";
  const middleware = bearerAuth(secret);

  const mockRes = () => {
    const res = {
      status: (_code: number) => res,
      json: (_body: unknown) => res,
    };
    return res as unknown as Response;
  };

  const mockNext = () => {
    let called = false;
    const next = () => {
      called = true;
    };
    return Object.assign(next, { wasCalled: () => called });
  };

  it("returns 401 when Authorization header is missing", () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.wasCalled()).toBe(false);
  });

  it("returns 401 when Authorization header has wrong token", () => {
    const req = { headers: { authorization: "Bearer wrong-secret" } } as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.wasCalled()).toBe(false);
  });

  it("calls next() when Authorization header is correct", () => {
    const req = { headers: { authorization: "Bearer test-secret" } } as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.wasCalled()).toBe(true);
  });

  it("returns 401 when Authorization header has wrong format", () => {
    const req = { headers: { authorization: "test-secret" } } as Request;
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next.wasCalled()).toBe(false);
  });
});
