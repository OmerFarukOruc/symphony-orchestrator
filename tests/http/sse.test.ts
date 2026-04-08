import http from "node:http";

import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TypedEventBus } from "../../src/core/event-bus.js";
import type { RisolutoEventMap } from "../../src/core/risoluto-events.js";
import { createSSEHandlerWithObserver } from "../../src/http/sse.js";

describe("SSE handler", () => {
  let eventBus: TypedEventBus<RisolutoEventMap>;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    eventBus = new TypedEventBus<RisolutoEventMap>();
    const app = express();
    app.disable("x-powered-by");
    app.get("/api/v1/events", createSSEHandlerWithObserver(eventBus));

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    eventBus.destroy();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("sets correct SSE headers", async () => {
    const response = await fetch(`${baseUrl}/api/v1/events`);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("connection")).toBe("keep-alive");
    await response.body?.cancel();
  });

  it("sends connected event on open", async () => {
    const line = await readFirstDataLine(baseUrl);
    expect(JSON.parse(line)).toEqual({ type: "connected" });
  });

  it("forwards EventBus events to the response", async () => {
    const lines = await collectDataLines(baseUrl, 2, () => {
      eventBus.emit("issue.started", { issueId: "i1", identifier: "MT-1", attempt: 1 });
    });
    expect(JSON.parse(lines[0])).toEqual({ type: "connected" });
    expect(JSON.parse(lines[1])).toEqual({
      type: "issue.started",
      payload: { issueId: "i1", identifier: "MT-1", attempt: 1 },
    });
  });

  it("cleans up listener on client disconnect", async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/v1/events`, { signal: controller.signal });
    const reader = response.body!.getReader();

    // Read the connected frame to confirm the connection is live
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("connected");

    // Abort the client — the server should remove the listener
    controller.abort();

    // Wait a tick for the close event to propagate
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Emitting after disconnect should not throw — the handler was removed
    expect(() => {
      eventBus.emit("poll.complete", { timestamp: new Date().toISOString(), issueCount: 0 });
    }).not.toThrow();
  });

  it("sends keep-alive comments on schedule", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/api/v1/events`, { signal: controller.signal });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Read the connected frame
      await reader.read();

      // Advance past the 30 s keep-alive interval
      await vi.advanceTimersByTimeAsync(30_000);

      const { value } = await reader.read();
      const text = decoder.decode(value);
      expect(text).toContain(":\n\n");

      controller.abort();
    } finally {
      vi.useRealTimers();
    }
  });

  it("registers cleanup on request close, response close, and response error", () => {
    const req = {
      once: vi.fn(),
    };
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      once: vi.fn(),
      writableEnded: false,
      destroyed: false,
    };

    createSSEHandlerWithObserver(eventBus)(req as never, res as never);

    expect(req.once).toHaveBeenCalledWith("close", expect.any(Function));
    expect(res.once).toHaveBeenCalledWith("close", expect.any(Function));
    expect(res.once).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("does not write when the response is already ended or destroyed", () => {
    for (const state of [
      { writableEnded: true, destroyed: false },
      { writableEnded: false, destroyed: true },
    ]) {
      const req = {
        once: vi.fn(),
      };
      const res = {
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        once: vi.fn(),
        writableEnded: state.writableEnded,
        destroyed: state.destroyed,
      };

      createSSEHandlerWithObserver(eventBus)(req as never, res as never);

      expect(res.write).not.toHaveBeenCalled();
    }
  });

  it("cleans up only once and stops writing after close", async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const offAnySpy = vi.spyOn(eventBus, "offAny");
    const reqListeners = new Map<string, (...args: unknown[]) => void>();
    const resListeners = new Map<string, (...args: unknown[]) => void>();

    const req = {
      once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        reqListeners.set(event, listener);
      }),
    };
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        resListeners.set(event, listener);
      }),
      writableEnded: false,
      destroyed: false,
    };

    try {
      createSSEHandlerWithObserver(eventBus)(req as never, res as never);
      expect(res.write).toHaveBeenCalledTimes(1);

      reqListeners.get("close")?.();
      reqListeners.get("close")?.();
      resListeners.get("close")?.();
      resListeners.get("error")?.(new Error("boom"));

      expect(offAnySpy).toHaveBeenCalledTimes(1);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

      eventBus.emit("issue.started", { issueId: "i1", identifier: "MT-1", attempt: 1 });
      await vi.advanceTimersByTimeAsync(30_000);

      expect(res.write).toHaveBeenCalledTimes(1);
    } finally {
      clearIntervalSpy.mockRestore();
      offAnySpy.mockRestore();
      vi.useRealTimers();
    }
  });
});

/* ---------- helpers ---------- */

async function readFirstDataLine(baseUrl: string): Promise<string> {
  const lines = await collectDataLines(baseUrl, 1);
  return lines[0];
}

async function collectDataLines(baseUrl: string, count: number, afterConnect?: () => void): Promise<string[]> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/v1/events`, { signal: controller.signal });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const collected: string[] = [];
  let buffer = "";

  while (collected.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lastDelimiter = buffer.lastIndexOf("\n\n");
    if (lastDelimiter === -1) continue;

    const complete = buffer.slice(0, lastDelimiter);
    buffer = buffer.slice(lastDelimiter + 2);

    for (const line of extractDataLines(complete)) {
      collected.push(line);
      if (collected.length === 1 && afterConnect) {
        afterConnect();
      }
    }
  }

  controller.abort();
  return collected;
}

function extractDataLines(buffer: string): string[] {
  const results: string[] = [];
  const frames = buffer.split("\n\n");
  for (const frame of frames) {
    if (frame.startsWith("data: ")) {
      results.push(frame.slice(6));
    }
  }
  return results;
}
