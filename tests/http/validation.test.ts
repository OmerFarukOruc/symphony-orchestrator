import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { z } from "zod";

import { validateBody, validateParams, validateQuery } from "../../src/http/validation.js";
import type { ValidationErrorResponse } from "../../src/http/validation.js";

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, query: {}, params: {} as Record<string, string>, ...overrides } as unknown as Request;
}

function mockRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 200,
    _json: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("passes valid body through to next()", () => {
    const req = mockReq({ body: { name: "alice" } });
    const res = mockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: "alice" });
  });

  it("returns 400 with structured error for invalid body", () => {
    const req = mockReq({ body: { name: 123 } });
    const res = mockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    const body = res._json as ValidationErrorResponse;
    expect(body.error).toBe("validation_error");
    expect(body.details).toBeInstanceOf(Array);
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.details[0]).toMatchObject({
      path: ["name"],
      code: expect.any(String),
      message: expect.any(String),
    });
  });

  it("catches missing required fields", () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    const body = res._json as ValidationErrorResponse;
    expect(body.error).toBe("validation_error");
    expect(body.details.some((detail) => detail.path.includes("name"))).toBe(true);
  });

  it("strips unknown fields when using strict schema", () => {
    const strictSchema = z.object({ name: z.string() }).strict();
    const req = mockReq({ body: { name: "alice", extra: "garbage" } });
    const res = mockRes();
    const next = vi.fn();

    validateBody(strictSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    const body = res._json as ValidationErrorResponse;
    expect(body.error).toBe("validation_error");
  });

  it("allows extra fields when schema is not strict", () => {
    const looseSchema = z.object({ name: z.string() });
    const req = mockReq({ body: { name: "alice", extra: "ignored" } });
    const res = mockRes();
    const next = vi.fn();

    validateBody(looseSchema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe("validateQuery", () => {
  const schema = z.object({ page: z.string().optional() });

  it("passes valid query through", () => {
    const req = mockReq({ query: { page: "2" } } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn();

    validateQuery(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 400 for invalid query", () => {
    const strict = z.object({ page: z.string() }).strict();
    const req = mockReq({ query: { unknown: "val" } } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn();

    validateQuery(strict)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
  });
});

describe("validateParams", () => {
  const schema = z.object({ id: z.string().min(1) });

  it("passes valid params through", () => {
    const req = mockReq({ params: { id: "abc-123" } as Record<string, string> });
    const res = mockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 400 for invalid params", () => {
    const req = mockReq({ params: { id: "" } as Record<string, string> });
    const res = mockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
  });
});
