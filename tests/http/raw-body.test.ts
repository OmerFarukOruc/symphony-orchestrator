import { describe, expect, it, afterEach } from "vitest";
import express from "express";
import http, { type IncomingMessage } from "node:http";

import type { WebhookRequest } from "../../src/http/webhook-types.js";

/* eslint-disable sonarjs/x-powered-by -- test-only express app, not production */

/** Mirrors the `express.json({ verify })` setup from `server.ts`. */
function startApp(): Promise<{ port: number; server: http.Server }> {
  const app = express();
  app.use(
    express.json({
      verify: (req: IncomingMessage, _res, buf: Buffer) => {
        if (req.url?.startsWith("/webhooks/")) {
          (req as unknown as WebhookRequest).rawBody = buf;
        }
      },
    }),
  );

  app.post("/webhooks/linear", (req, res) => {
    const webhookReq = req as WebhookRequest;
    res.json({
      hasRawBody: Buffer.isBuffer(webhookReq.rawBody),
      rawBodyLength: webhookReq.rawBody?.length ?? null,
    });
  });

  app.post("/api/v1/refresh", (req, res) => {
    const webhookReq = req as WebhookRequest;
    res.json({
      hasRawBody: Buffer.isBuffer(webhookReq.rawBody),
      rawBodyLength: webhookReq.rawBody?.length ?? null,
    });
  });

  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve({ port: address.port, server });
      }
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("raw body capture for webhook paths", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = null;
    }
  });

  it("populates rawBody as a Buffer for POST /webhooks/linear", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const payload = JSON.stringify({ action: "update", type: "Issue" });
    const response = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { hasRawBody: boolean; rawBodyLength: number | null };
    expect(body.hasRawBody).toBe(true);
    expect(body.rawBodyLength).toBe(Buffer.byteLength(payload));
  });

  it("does NOT populate rawBody for POST to non-webhook path", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/v1/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "manual" }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { hasRawBody: boolean; rawBodyLength: number | null };
    expect(body.hasRawBody).toBe(false);
    expect(body.rawBodyLength).toBeNull();
  });
});
