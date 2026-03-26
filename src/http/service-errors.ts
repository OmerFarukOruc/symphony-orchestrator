import type { Request, Response, NextFunction } from "express";

/**
 * Explicit service failure contracts for the HTTP API layer.
 *
 * This module defines the error handling boundary between service stores
 * (which throw) and the HTTP surface (which must return structured JSON errors).
 *
 * Failure modes (documented for API consumers):
 * - 400 `service_validation_error` — service rejected input (TypeError from stores).
 * - 500 `service_error` — unexpected internal failure from a service store.
 */

/** Standard error response shape shared across all API routes. */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Express error-handling middleware that catches service-layer exceptions
 * and returns structured JSON error responses.
 *
 * Mount after all route registration to act as the last-resort handler.
 */
export function serviceErrorHandler(error: Error, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof TypeError) {
    res.status(400).json({
      error: {
        code: "service_validation_error",
        message: error.message,
      },
    } satisfies ApiErrorResponse);
    return;
  }

  res.status(500).json({
    error: {
      code: "service_error",
      message: error.message,
    },
  } satisfies ApiErrorResponse);
}
