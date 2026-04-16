import http from "node:http";

import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger } from "../../src/core/logger.js";
import { registerTemplateApi } from "../../src/http/routes/prompt.js";
import { openDatabase, closeDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { PromptTemplateStore } from "../../src/prompt/store.js";

let db: RisolutoDatabase;
let server: http.Server | null = null;

async function startServer(): Promise<string> {
  const app = express();
  app.use(express.json());
  registerTemplateApi(app, { templateStore: new PromptTemplateStore(db, createLogger()) });
  server = await new Promise<http.Server>((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });
  const port = (server.address() as { port: number }).port;
  return `http://127.0.0.1:${port}`;
}

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
    server = null;
  }
  closeDatabase(db);
});

describe("registerTemplateApi", () => {
  it("rejects unsupported Liquid filters on create", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/v1/templates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "bad", name: "Bad", body: "{{ issue.title | upcase }}" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_template_body",
        message: expect.stringContaining("unsupported Liquid output expression"),
      },
    });
  });

  it("rejects unsupported Liquid statements on update", async () => {
    const baseUrl = await startServer();
    await fetch(`${baseUrl}/api/v1/templates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "good", name: "Good", body: "{{ issue.title }}" }),
    });

    const response = await fetch(`${baseUrl}/api/v1/templates/good`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "{% assign x = issue.title %}" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_template_body",
        message: expect.stringContaining("unsupported Liquid statement"),
      },
    });
  });
});
