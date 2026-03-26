import { describe, expect, it, afterEach, vi } from "vitest";
import express from "express";
import http from "node:http";

import { createWriteGuard } from "../../src/http/write-guard.js";

/* eslint-disable sonarjs/x-powered-by -- test-only express app, not production */
function startApp(writeToken?: string): Promise<{ port: number; server: http.Server }> {
  if (writeToken) {
    vi.stubEnv("SYMPHONY_WRITE_TOKEN", writeToken);
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

  it("rejects POST without token when SYMPHONY_WRITE_TOKEN is set", async () => {
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

  it("allows POST with correct token when SYMPHONY_WRITE_TOKEN is set", async () => {
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

  it("rejects POST with wrong token when SYMPHONY_WRITE_TOKEN is set", async () => {
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
