import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const REQUEST_ID_HEADER = "X-Request-ID";

export type TraceOutcome = "success" | "failure";

export interface ObservabilityTraceRecord {
  id: string;
  component: string;
  metric: string;
  operation: string;
  outcome: TraceOutcome;
  correlationId: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number | null;
  reason: string | null;
  data?: Record<string, unknown>;
}

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

export function buildTraceRecord(
  component: string,
  input: {
    metric: string;
    operation?: string;
    outcome: TraceOutcome;
    correlationId?: string | null;
    startedAt?: string;
    endedAt?: string;
    durationMs?: number | null;
    reason?: string | null;
    data?: Record<string, unknown>;
  },
): ObservabilityTraceRecord {
  const endedAt = input.endedAt ?? new Date().toISOString();
  return {
    id: randomUUID(),
    component,
    metric: input.metric,
    operation: input.operation ?? input.metric,
    outcome: input.outcome,
    correlationId: input.correlationId ?? null,
    startedAt: input.startedAt ?? endedAt,
    endedAt,
    durationMs: input.durationMs ?? null,
    reason: input.reason ?? null,
    data: input.data,
  };
}

export { REQUEST_ID_HEADER };
