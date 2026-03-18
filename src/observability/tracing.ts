import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const REQUEST_ID_HEADER = "X-Request-ID";

/**
 * Express middleware that propagates or generates a request trace ID.
 *
 * If the incoming request carries an `X-Request-ID` header, it is preserved;
 * otherwise a new UUID v4 is generated.  The ID is set on the response
 * header and attached to the request object for downstream consumers.
 */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.get(REQUEST_ID_HEADER) as string | undefined) || randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  (req as Request & { requestId: string }).requestId = requestId;
  next();
}

/** Retrieve the request ID attached by `tracingMiddleware`. */
export function getRequestId(req: Request): string {
  return (req as Request & { requestId?: string }).requestId ?? "unknown";
}

export { REQUEST_ID_HEADER };
