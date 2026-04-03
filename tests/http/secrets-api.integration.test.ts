/**
 * Integration tests for the Secrets API HTTP routes.
 *
 * Uses the shared `startTestServer` harness with a real `SecretsStore` backed
 * by a temp directory, exercising all route contracts for GET /api/v1/secrets
 * and POST/DELETE /api/v1/secrets/:key.
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SecretsStore } from "../../src/secrets/store.js";
import { buildSilentLogger, startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

let ctx: TestServerResult;
let tmpDir: string;
let secretsStore: SecretsStore;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "secrets-test-"));
  const logger = buildSilentLogger();
  secretsStore = new SecretsStore(tmpDir, logger, { masterKey: "test-master-key-32-chars-exactly!" });
  await secretsStore.start();
  ctx = await startTestServer({ secretsStore });
});

afterEach(async () => {
  await ctx.teardown();
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("GET /api/v1/secrets", () => {
  it("returns an empty key list initially", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ keys: [] });
  });

  it("returns the stored key after a successful POST", async () => {
    await fetch(`${ctx.baseUrl}/api/v1/secrets/MY_KEY`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "secret-value" }),
    });

    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ keys: ["MY_KEY"] });
  });

  it("returns 405 for PATCH on the collection route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error.code).toBe("method_not_allowed");
  });
});

describe("POST /api/v1/secrets/:key", () => {
  it("sets a secret and returns 204", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets/MY_KEY`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "my-secret" }),
    });
    expect(response.status).toBe(204);
    expect(secretsStore.get("MY_KEY")).toBe("my-secret");
  });

  it("returns 400 with invalid_secret_key for a key containing a space", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets/invalid%20key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_secret_key");
  });

  it("returns 400 with invalid_secret_value for an empty value string", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets/MY_KEY`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_secret_value");
  });

  it("returns 400 when the value field is missing from the body", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets/MY_KEY`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_secret_value");
  });

  it("returns 405 for GET on the key route", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets/MY_KEY`);
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error.code).toBe("method_not_allowed");
  });
});

describe("DELETE /api/v1/secrets/:key", () => {
  it("deletes an existing secret and returns 204", async () => {
    await fetch(`${ctx.baseUrl}/api/v1/secrets/MY_KEY`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "my-secret" }),
    });

    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets/MY_KEY`, {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect(secretsStore.get("MY_KEY")).toBeNull();
  });

  it("returns 404 with secret_not_found when the key does not exist", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets/MY_KEY`, {
      method: "DELETE",
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("secret_not_found");
  });

  it("returns 400 with invalid_secret_key for an invalid key", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/secrets/invalid%21key`, {
      method: "DELETE",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_secret_key");
  });
});
