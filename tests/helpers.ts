import type { FastifyReply } from "fastify";
import { vi } from "vitest";
import type { SymphonyLogger } from "../src/core/types.js";

/**
 * Creates a mock SymphonyLogger for testing.
 * All methods are vi.fn() mocks that can be inspected in tests.
 */
export function createMockLogger(): SymphonyLogger {
  const logger: SymphonyLogger = {
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
 * Creates a mock Fastify Reply object for testing HTTP handlers.
 * Tracks status code and body for assertions.
 */
export function makeMockReply(): FastifyReply & { _status: number; _body: unknown } {
  const reply = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      reply._status = code;
      return reply;
    },
    send(data: unknown) {
      reply._body = data;
      return reply;
    },
    // Some handlers still use .json() in tests — alias to .send()
    json(data: unknown) {
      reply._body = data;
      return reply;
    },
  };
  return reply as unknown as FastifyReply & { _status: number; _body: unknown };
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
