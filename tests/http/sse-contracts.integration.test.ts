/**
 * SSE contract integration tests.
 *
 * Exercises SSE event propagation through the full HttpServer stack (not the
 * standalone handler). Tests connect to `/api/v1/events`, emit events on the
 * bus provided by the Tier 2 harness, and verify they arrive as correctly
 * formatted SSE frames.
 *
 * Covers: initial connected event, all 13 RisolutoEventMap event types,
 * concurrent clients, disconnect/reconnect, server restart on fresh port,
 * and emit-before-connect safety.
 */

import { afterEach, describe, expect, it } from "vitest";

import type { RisolutoEventMap } from "../../src/core/risoluto-events.js";
import type { WebhookHealthStatus } from "../../src/webhook/types.js";
import { startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parsed SSE frame: either the initial `connected` sentinel or a channel
 * envelope carrying a typed payload.
 */
type SSEFrame =
  | { type: "connected" }
  | { type: keyof RisolutoEventMap; payload: RisolutoEventMap[keyof RisolutoEventMap] };

/**
 * Read `count` SSE data frames from the server. Optionally calls `afterConnect`
 * once the first (connected) frame has been received, giving the caller a safe
 * point to emit bus events.
 */
async function collectFrames(
  baseUrl: string,
  count: number,
  afterConnect?: () => void,
  timeoutMs = 10_000,
): Promise<SSEFrame[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(`${baseUrl}/api/v1/events`, {
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const frames: SSEFrame[] = [];
  let buffer = "";

  while (frames.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lastDelimiter = buffer.lastIndexOf("\n\n");
    if (lastDelimiter === -1) continue;

    const complete = buffer.slice(0, lastDelimiter);
    buffer = buffer.slice(lastDelimiter + 2);

    for (const raw of extractDataPayloads(complete)) {
      frames.push(JSON.parse(raw) as SSEFrame);
      if (frames.length === 1 && afterConnect) {
        afterConnect();
      }
    }
  }

  clearTimeout(timeout);
  controller.abort();
  return frames;
}

/** Extract `data:` payloads from a chunk of SSE text (may contain multiple frames). */
function extractDataPayloads(text: string): string[] {
  const results: string[] = [];
  for (const frame of text.split("\n\n")) {
    if (frame.startsWith("data: ")) {
      results.push(frame.slice(6));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Typed payload factories — one per RisolutoEventMap channel
// ---------------------------------------------------------------------------

const samplePayloads: { [K in keyof RisolutoEventMap]: RisolutoEventMap[K] } = {
  "issue.started": { issueId: "iss-1", identifier: "RS-1", attempt: 1 },
  "issue.completed": { issueId: "iss-2", identifier: "RS-2", outcome: "success" },
  "issue.stalled": { issueId: "iss-3", identifier: "RS-3", reason: "timeout" },
  "issue.queued": { issueId: "iss-4", identifier: "RS-4" },
  "worker.failed": { issueId: "iss-5", identifier: "RS-5", error: "OOM" },
  "model.updated": { identifier: "RS-6", model: "o4-mini", source: "api" },
  "workspace.event": { issueId: "iss-7", identifier: "RS-7", status: "ready" },
  "agent.event": {
    issueId: "iss-8",
    identifier: "RS-8",
    type: "message",
    message: "Working on it",
    sessionId: "sess-1",
    timestamp: "2026-01-01T00:00:00Z",
    content: null,
  },
  "poll.complete": { timestamp: "2026-01-01T00:00:00Z", issueCount: 5 },
  "system.error": { message: "rate limit hit", context: { retryAfter: 30 } },
  "audit.mutation": {
    tableName: "config",
    key: "model",
    path: null,
    operation: "upsert",
    actor: "api",
    timestamp: "2026-01-01T00:00:00Z",
  },
  "webhook.received": { eventType: "Issue", timestamp: "2026-01-01T00:00:00Z" },
  "webhook.health_changed": {
    oldStatus: "disconnected" as WebhookHealthStatus,
    newStatus: "connected" as WebhookHealthStatus,
  },
};

const allEventTypes = Object.keys(samplePayloads) as Array<keyof RisolutoEventMap>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SSE contract tests (full HttpServer stack)", () => {
  let ctx: TestServerResult;

  afterEach(async () => {
    await ctx?.teardown();
  });

  // ---- Happy path: initial connected event ----

  it("sends { type: 'connected' } on initial SSE connection", async () => {
    ctx = await startTestServer({ eventBus: true });

    const frames = await collectFrames(ctx.baseUrl, 1);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ type: "connected" });
  });

  // ---- Happy path: individual event type propagation ----

  it.each(allEventTypes)("propagates %s through the full server stack", async (channel) => {
    ctx = await startTestServer({ eventBus: true });
    const payload = samplePayloads[channel];

    const frames = await collectFrames(ctx.baseUrl, 2, () => {
      ctx.eventBus!.emit(channel, payload);
    });

    expect(frames[0]).toEqual({ type: "connected" });
    expect(frames[1]).toEqual({ type: channel, payload });
  });

  // ---- Happy path: multiple event types arrive in order ----

  it("delivers multiple event types in emission order", async () => {
    ctx = await startTestServer({ eventBus: true });

    const emitOrder: Array<keyof RisolutoEventMap> = ["issue.started", "poll.complete", "issue.completed"];

    // 1 connected + 3 events = 4 frames
    const frames = await collectFrames(ctx.baseUrl, 4, () => {
      for (const channel of emitOrder) {
        ctx.eventBus!.emit(channel, samplePayloads[channel]);
      }
    });

    expect(frames[0]).toEqual({ type: "connected" });
    for (let index = 0; index < emitOrder.length; index++) {
      const channel = emitOrder[index];
      expect(frames[index + 1]).toEqual({
        type: channel,
        payload: samplePayloads[channel],
      });
    }
  });

  // ---- Edge case: emit before any client connects ----

  it("does not throw when emitting before any SSE client connects", async () => {
    ctx = await startTestServer({ eventBus: true });

    // Emit with no SSE clients connected — should be silently dropped
    expect(() => {
      ctx.eventBus!.emit("issue.started", samplePayloads["issue.started"]);
    }).not.toThrow();

    // Subsequent connection still works normally
    const frames = await collectFrames(ctx.baseUrl, 1);
    expect(frames[0]).toEqual({ type: "connected" });
  });

  // ---- Reconnect: disconnect then reconnect ----

  it("receives new connected event on reconnect after disconnect", async () => {
    ctx = await startTestServer({ eventBus: true });

    // First connection
    const firstFrames = await collectFrames(ctx.baseUrl, 1);
    expect(firstFrames[0]).toEqual({ type: "connected" });

    // Second connection (simulates reconnect) — should get a fresh connected event
    const secondFrames = await collectFrames(ctx.baseUrl, 2, () => {
      ctx.eventBus!.emit("poll.complete", samplePayloads["poll.complete"]);
    });
    expect(secondFrames[0]).toEqual({ type: "connected" });
    expect(secondFrames[1]).toEqual({
      type: "poll.complete",
      payload: samplePayloads["poll.complete"],
    });
  });

  // ---- Server restart reconnect ----

  it("serves SSE on a new port after server stop and restart", async () => {
    ctx = await startTestServer({ eventBus: true });

    // Verify initial connection works
    const firstFrames = await collectFrames(ctx.baseUrl, 1);
    expect(firstFrames[0]).toEqual({ type: "connected" });

    // Stop the server
    await ctx.server.stop();

    // Restart on a fresh dynamic port (port 0 avoids EADDRINUSE)
    const { port: newPort } = await ctx.server.start(0);
    const newBaseUrl = `http://127.0.0.1:${newPort}`;

    // Connect to the new address and verify events still flow
    const restartFrames = await collectFrames(newBaseUrl, 2, () => {
      ctx.eventBus!.emit("system.error", samplePayloads["system.error"]);
    });

    expect(restartFrames[0]).toEqual({ type: "connected" });
    expect(restartFrames[1]).toEqual({
      type: "system.error",
      payload: samplePayloads["system.error"],
    });
  });

  // ---- Concurrent clients ----

  it("broadcasts the same event to two concurrent SSE clients", async () => {
    ctx = await startTestServer({ eventBus: true });

    const payload = samplePayloads["issue.started"];

    // Both clients connect and wait for connected + one event
    const clientAPromise = collectFrames(ctx.baseUrl, 2);
    const clientBPromise = collectFrames(ctx.baseUrl, 2);

    // Small delay to let both connections establish before emitting
    await new Promise((resolve) => setTimeout(resolve, 50));
    ctx.eventBus!.emit("issue.started", payload);

    const [clientA, clientB] = await Promise.all([clientAPromise, clientBPromise]);

    for (const frames of [clientA, clientB]) {
      expect(frames[0]).toEqual({ type: "connected" });
      expect(frames[1]).toEqual({ type: "issue.started", payload });
    }
  });

  // ---- SSE headers through full stack ----

  it("sets correct SSE headers through the full HttpServer stack", async () => {
    ctx = await startTestServer({ eventBus: true });

    const response = await fetch(`${ctx.baseUrl}/api/v1/events`);

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("connection")).toBe("keep-alive");

    await response.body?.cancel();
  });

  // ---- All 13 event types in a single stream ----

  it("delivers all 13 event types through a single SSE connection", async () => {
    ctx = await startTestServer({ eventBus: true });

    // 1 connected + 13 events = 14 frames
    const frames = await collectFrames(ctx.baseUrl, 14, () => {
      for (const channel of allEventTypes) {
        ctx.eventBus!.emit(channel, samplePayloads[channel]);
      }
    });

    expect(frames).toHaveLength(14);
    expect(frames[0]).toEqual({ type: "connected" });

    for (let index = 0; index < allEventTypes.length; index++) {
      const channel = allEventTypes[index];
      expect(frames[index + 1]).toEqual({
        type: channel,
        payload: samplePayloads[channel],
      });
    }
  });

  // ---- Endpoint absent when no event bus ----

  it("returns 404 on /api/v1/events when event bus is not configured", async () => {
    ctx = await startTestServer(); // No eventBus override → Tier 1

    const response = await fetch(`${ctx.baseUrl}/api/v1/events`);

    expect(response.status).toBe(404);
  });
});
