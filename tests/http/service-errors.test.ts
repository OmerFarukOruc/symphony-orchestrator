import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import http from "node:http";

import { serviceErrorHandler } from "../../src/http/service-errors.js";

/* eslint-disable sonarjs/x-powered-by -- test-only express app, not production */
function startApp(): Promise<{ port: number; server: http.Server }> {
  const app = express();
  app.use(express.json());

  app.get("/api/test/type-error", (_req, _res) => {
    throw new TypeError("value must be a positive integer");
  });

  app.get("/api/test/generic-error", (_req, _res) => {
    throw new Error("database connection failed");
  });

  app.get("/api/test/ok", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(serviceErrorHandler);

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

describe("serviceErrorHandler", () => {
  let server: http.Server | null = null;

  afterAll(async () => {
    if (server) {
      await closeServer(server);
      server = null;
    }
  });

  it("converts TypeError to 400 service_validation_error", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/test/type-error`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("service_validation_error");
    expect(body.error.message).toBe("value must be a positive integer");

    await closeServer(s);
    server = null;
  });

  it("converts generic Error to 500 service_error", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/test/generic-error`);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("service_error");
    expect(body.error.message).toBe("database connection failed");

    await closeServer(s);
    server = null;
  });

  it("does not interfere with normal responses", async () => {
    const { port, server: s } = await startApp();
    server = s;

    const response = await fetch(`http://127.0.0.1:${port}/api/test/ok`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    await closeServer(s);
    server = null;
  });
});
