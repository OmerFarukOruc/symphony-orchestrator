import type { Response as ExpressResponse } from "express";
import { vi } from "vitest";
import type { RisolutoLogger } from "../src/core/types.js";

/**
 * Creates a mock RisolutoLogger for testing.
 * All methods are vi.fn() mocks that can be inspected in tests.
 */
export function createMockLogger(): RisolutoLogger {
  const logger: RisolutoLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  vi.mocked(logger.child).mockReturnValue(logger);
  return logger;
}

/**
 * Creates a mock Express Response object for testing HTTP handlers.
 * Tracks status code and JSON body for assertions.
 */
export function makeMockResponse(): ExpressResponse & { _status: number; _body: unknown } {
  const res = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._body = data;
      return res;
    },
  };
  return res as unknown as ExpressResponse & { _status: number; _body: unknown };
}

/**
 * Creates a JSON Response object for fetch mocking.
 */
export function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Creates a text Response object for fetch mocking.
 */
export function createTextResponse(status: number, body: string): Response {
  return new Response(body, { status });
}
