/**
 * SSE (Server-Sent Events) handler for real-time event streaming.
 *
 * Bridges the internal TypedEventBus to HTTP clients via `text/event-stream`.
 * Each bus emission is serialized as a JSON SSE frame. A keep-alive comment
 * is sent every 30 seconds to prevent proxy timeouts.
 */

import type { Request, Response } from "express";

import type { TypedEventBus } from "../core/event-bus.js";
import type { SymphonyEventMap } from "../core/symphony-events.js";

const KEEP_ALIVE_MS = 30_000;

type AnyHandler = (channel: keyof SymphonyEventMap, payload: SymphonyEventMap[keyof SymphonyEventMap]) => void;

/**
 * Creates an Express request handler that streams EventBus events over SSE.
 *
 * On connect the client receives `{"type":"connected"}`. Subsequent frames
 * carry `{"type":"<channel>","payload":{...}}` for every bus emission.
 */
export function createSSEHandler(eventBus: TypedEventBus<SymphonyEventMap>): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    configureSSEHeaders(res);

    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    const handler: AnyHandler = (channel, payload) => {
      res.write(`data: ${JSON.stringify({ type: channel, payload })}\n\n`);
    };

    eventBus.onAny(handler);

    const keepAliveTimer = setInterval(() => {
      res.write(":\n\n");
    }, KEEP_ALIVE_MS);

    req.on("close", () => {
      clearInterval(keepAliveTimer);
      eventBus.offAny(handler);
    });
  };
}

function configureSSEHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}
