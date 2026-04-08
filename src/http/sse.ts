/**
 * SSE (Server-Sent Events) handler for real-time event streaming.
 *
 * Bridges the internal TypedEventBus to HTTP clients via `text/event-stream`.
 * Each bus emission is serialized as a JSON SSE frame. A keep-alive comment
 * is sent every 30 seconds to prevent proxy timeouts.
 */

import type { Request, Response } from "express";

import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { ComponentObserver } from "../observability/hub.js";
import { getRequestId } from "../observability/tracing.js";

const KEEP_ALIVE_MS = 30_000;

type AnyHandler = (channel: keyof RisolutoEventMap, payload: RisolutoEventMap[keyof RisolutoEventMap]) => void;

/**
 * Creates an Express request handler that streams EventBus events over SSE.
 *
 * On connect the client receives `{"type":"connected"}`. Subsequent frames
 * carry `{"type":"<channel>","payload":{...}}` for every bus emission.
 */
export function createSSEHandlerWithObserver(
  eventBus: TypedEventBus<RisolutoEventMap>,
  observer?: ComponentObserver,
): (req: Request, res: Response) => void {
  let activeConnections = 0;
  return (req: Request, res: Response) => {
    configureSSEHeaders(res);
    const correlationId = getRequestId(req);
    activeConnections += 1;
    observer?.setSession(correlationId, {
      status: "connected",
      correlationId,
      metadata: {
        path: req.path,
      },
    });
    observer?.recordOperation({
      metric: "sse_connect",
      operation: "sse_connect",
      outcome: "success",
      correlationId,
      data: { activeConnections },
    });
    observer?.setHealth({
      surface: "sse",
      status: "ok",
      reason: activeConnections === 1 ? "first SSE client connected" : "SSE clients connected",
      details: { activeConnections },
    });

    let closed = false;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

    const safeWrite = (chunk: string): void => {
      if (closed || res.writableEnded || res.destroyed) {
        return;
      }
      res.write(chunk);
    };

    const handler: AnyHandler = (channel, payload) => {
      safeWrite(`data: ${JSON.stringify({ type: channel, payload })}\n\n`);
    };

    const cleanup = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      if (keepAliveTimer !== null) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      eventBus.offAny(handler);
      activeConnections = Math.max(0, activeConnections - 1);
      observer?.clearSession(correlationId);
      observer?.recordOperation({
        metric: "sse_disconnect",
        operation: "sse_disconnect",
        outcome: "success",
        correlationId,
        data: { activeConnections },
      });
      observer?.setHealth({
        surface: "sse",
        status: "ok",
        reason: activeConnections === 0 ? "no active SSE clients" : "SSE stream healthy",
        details: { activeConnections },
      });
    };

    safeWrite(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    eventBus.onAny(handler);

    keepAliveTimer = setInterval(() => {
      safeWrite(":\n\n");
    }, KEEP_ALIVE_MS);

    req.once("close", cleanup);
    res.once("close", cleanup);
    res.once("error", () => {
      observer?.recordOperation({
        metric: "sse_error",
        operation: "sse_stream",
        outcome: "failure",
        correlationId,
        reason: "response stream error",
        data: { activeConnections },
      });
      observer?.setHealth({
        surface: "sse",
        status: "warn",
        reason: "response stream error",
        details: { activeConnections },
      });
      cleanup();
    });
  };
}

function configureSSEHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}
