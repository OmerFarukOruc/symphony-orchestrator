/**
 * Reusable Zod-based request validation middleware for Express routes.
 *
 * Usage:
 *   router.post("/path", validateBody(mySchema), handler);
 *   router.get("/path", validateQuery(mySchema), handler);
 *   router.get("/path/:id", validateParams(mySchema), handler);
 */

import type { NextFunction, Request, Response } from "express";
import type { ZodError, ZodType } from "zod";

/** Structured 400 response shape returned on validation failure. */
export interface ValidationErrorResponse {
  error: "validation_error";
  details: Array<{
    code: string;
    path: PropertyKey[];
    message: string;
  }>;
}

function formatZodError(error: ZodError): ValidationErrorResponse {
  return {
    error: "validation_error",
    details: error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
    })),
  };
}

/**
 * Express middleware factory that validates `req.body` against a Zod schema.
 * On success the parsed (and potentially stripped) data replaces `req.body`.
 * On failure a 400 response with structured error details is sent.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Express middleware factory that validates `req.query` against a Zod schema.
 * On success the parsed data replaces `req.query`.
 * On failure a 400 response with structured error details is sent.
 */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}

/**
 * Express middleware factory that validates `req.params` against a Zod schema.
 * On success the parsed data replaces `req.params`.
 * On failure a 400 response with structured error details is sent.
 */
export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json(formatZodError(result.error));
      return;
    }
    req.params = result.data as typeof req.params;
    next();
  };
}
