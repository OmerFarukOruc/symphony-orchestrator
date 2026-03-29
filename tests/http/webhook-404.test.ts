import { describe, expect, it, afterEach } from "vitest";
import express from "express";
import http from "node:http";

/* eslint-disable sonarjs/x-powered-by -- test-only express app, not production */

/**
 * Minimal app that mirrors the SPA catch-all and webhook 404 handler
 * ordering from `routes.ts`.
 */
function startApp(): Promise<{ port: number; server: http.Server }> {
  const app = express();
  app.use(express.json());

  // A registered webhook route (would normally be the real handler)
  app.post("/webhooks/linear", (_req, res) => {
    res.json({ ok: true });
  });

  // JSON 404 for unmatched webhook paths — before SPA catch-all
  app.all("/webhooks/*path", (_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  });

  // SPA catch-all (returns HTML)
  app.use((_req, res) => {
    res.type("html").send("<html><body>SPA</body></html>");
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

describe("webhook 404 handler", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = null;
    }
  });

  it("returns JSON 404 for GET /webhooks/unknown", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/webhooks/unknown`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("returns JSON 404 for POST /webhooks/unknown", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/webhooks/unknown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("does NOT return JSON for non-webhook paths (SPA catch-all still works)", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/some-random-path`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
  });
});
