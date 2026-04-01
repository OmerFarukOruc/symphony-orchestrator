import { describe, expect, it, afterEach, vi } from "vitest";
import express from "express";
import http from "node:http";

import { createWriteGuard, isLoopbackAddress } from "../../src/http/write-guard.js";

/* eslint-disable sonarjs/x-powered-by -- test-only express app, not production */
function startApp(writeToken?: string): Promise<{ port: number; server: http.Server }> {
  if (writeToken) {
    vi.stubEnv("RISOLUTO_WRITE_TOKEN", writeToken);
  }

  const app = express();
  app.use(express.json());
  app.use("/api/", createWriteGuard());

  app.route("/api/v1/test").get((_req, res) => {
    res.json({ ok: true });
  });
  app.route("/api/v1/test").post((_req, res) => {
    res.status(201).json({ created: true });
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

/**
 * Start an app with the write guard mounted globally (matching production
 * `server.ts`) so that `/webhooks/` exemption is exercised.
 */
function startGlobalApp(writeToken?: string): Promise<{ port: number; server: http.Server }> {
  if (writeToken) {
    vi.stubEnv("RISOLUTO_WRITE_TOKEN", writeToken);
  }

  const app = express();
  app.use(express.json());
  app.use(createWriteGuard());

  app.route("/api/v1/refresh").post((_req, res) => {
    res.status(202).json({ queued: true });
  });
  app.route("/webhooks/linear").post((_req, res) => {
    res.status(200).json({ ok: true });
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

describe("createWriteGuard", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server) {
      await closeServer(server);
      server = null;
    }
  });

  it("allows GET requests without restriction", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/v1/test`);
    expect(response.status).toBe(200);
  });

  it("allows POST requests from loopback when no token configured", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/v1/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(201);
  });

  it("rejects POST without token when RISOLUTO_WRITE_TOKEN is set", async () => {
    const { port, server: s } = await startApp("test-secret-token");
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/v1/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("write_unauthorized");
  });

  it("allows POST with correct token when RISOLUTO_WRITE_TOKEN is set", async () => {
    const { port, server: s } = await startApp("test-secret-token");
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/v1/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret-token",
      },
      body: "{}",
    });
    expect(response.status).toBe(201);
  });

  it("rejects POST with wrong token when RISOLUTO_WRITE_TOKEN is set", async () => {
    const { port, server: s } = await startApp("test-secret-token");
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/v1/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: "{}",
    });
    expect(response.status).toBe(401);
  });
});

describe("isLoopbackAddress", () => {
  it("accepts the IPv4 loopback block and IPv6 loopback forms", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.0.1.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- explicit loopback regression coverage
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- explicit loopback regression coverage
    expect(isLoopbackAddress("::ffff:127.0.2.3")).toBe(true);
  });

  it("rejects non-loopback addresses", () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- explicit non-loopback regression coverage
    expect(isLoopbackAddress("192.168.1.10")).toBe(false);
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- explicit non-loopback regression coverage
    expect(isLoopbackAddress("::ffff:10.0.0.5")).toBe(false);
  });
});

describe("createWriteGuard — webhook path exemption", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server) {
      await closeServer(server);
      server = null;
    }
  });

  it("allows POST to /webhooks/linear from loopback without token", async () => {
    const { port, server: s } = await startGlobalApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update" }),
    });
    expect(response.status).toBe(200);
  });

  it("allows POST to /webhooks/linear when RISOLUTO_WRITE_TOKEN is set (guard skipped)", async () => {
    const { port, server: s } = await startGlobalApp("secret-token");
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/webhooks/linear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update" }),
    });
    // Write guard skipped entirely for webhook paths — no Bearer token needed
    expect(response.status).toBe(200);
  });

  it("still blocks POST to /api/v1/refresh when RISOLUTO_WRITE_TOKEN is set and no token supplied", async () => {
    const { port, server: s } = await startGlobalApp("secret-token");
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/v1/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(401);
  });

  it("allows GET to non-webhook paths unchanged", async () => {
    const { port, server: s } = await startGlobalApp();
    server = s;

    // GET is a safe method — always passes through regardless of path
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/refresh`);
    // No GET handler registered, but the guard itself should not block it.
    // Express will return 404 or similar, but NOT 401/403.
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});
