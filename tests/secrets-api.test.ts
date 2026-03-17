import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import express, { type Express } from "express";
import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../src/logger.js";
import { registerSecretsApi } from "../src/secrets-api.js";
import { SecretsStore } from "../src/secrets-store.js";

const tempDirs: string[] = [];
const originalMasterKey = process.env.MASTER_KEY;

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-secrets-api-test-"));
  tempDirs.push(dir);
  return dir;
}

async function startServer(app: Express): Promise<{ server: http.Server; baseUrl: string }> {
  const server = await new Promise<http.Server>((resolve, reject) => {
    const started = app.listen(0, "127.0.0.1", () => {
      resolve(started);
    });
    started.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server failed to bind to an ephemeral port");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

afterEach(async () => {
  process.env.MASTER_KEY = originalMasterKey;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("registerSecretsApi", () => {
  it("supports listing, setting, and deleting secret keys", async () => {
    const dir = await createTempDir();
    process.env.MASTER_KEY = "secrets-api-master-key";
    const secretsStore = new SecretsStore(dir, createLogger());
    await secretsStore.start();

    const app = express();
    app.use(express.json());
    registerSecretsApi(app, { secretsStore });

    const { server, baseUrl } = await startServer(app);
    try {
      const initialResponse = await fetch(`${baseUrl}/api/v1/secrets`);
      expect(initialResponse.status).toBe(200);
      expect(await initialResponse.json()).toEqual({ keys: [] });

      const setResponse = await fetch(`${baseUrl}/api/v1/secrets/OPENAI_API_KEY`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "sk-test" }),
      });
      expect(setResponse.status).toBe(204);
      expect(secretsStore.get("OPENAI_API_KEY")).toBe("sk-test");

      const listResponse = await fetch(`${baseUrl}/api/v1/secrets`);
      expect(listResponse.status).toBe(200);
      expect(await listResponse.json()).toEqual({ keys: ["OPENAI_API_KEY"] });

      const deleteResponse = await fetch(`${baseUrl}/api/v1/secrets/OPENAI_API_KEY`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(204);
      expect(secretsStore.get("OPENAI_API_KEY")).toBeNull();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("returns validation errors for invalid keys, missing values, unknown keys, and method mismatches", async () => {
    const dir = await createTempDir();
    process.env.MASTER_KEY = "secrets-api-errors-key";
    const secretsStore = new SecretsStore(dir, createLogger());
    await secretsStore.start();

    const app = express();
    app.use(express.json());
    registerSecretsApi(app, { secretsStore });

    const { server, baseUrl } = await startServer(app);
    try {
      const invalidKeyResponse = await fetch(`${baseUrl}/api/v1/secrets/invalid key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x" }),
      });
      expect(invalidKeyResponse.status).toBe(400);
      expect((await invalidKeyResponse.json()).error.code).toBe("invalid_secret_key");

      const invalidValueResponse = await fetch(`${baseUrl}/api/v1/secrets/VALID_KEY`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "" }),
      });
      expect(invalidValueResponse.status).toBe(400);
      expect((await invalidValueResponse.json()).error.code).toBe("invalid_secret_value");

      const missingKeyDeleteResponse = await fetch(`${baseUrl}/api/v1/secrets/MISSING`, {
        method: "DELETE",
      });
      expect(missingKeyDeleteResponse.status).toBe(404);
      expect((await missingKeyDeleteResponse.json()).error.code).toBe("secret_not_found");

      const methodNotAllowedResponse = await fetch(`${baseUrl}/api/v1/secrets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(methodNotAllowedResponse.status).toBe(405);
      expect((await methodNotAllowedResponse.json()).error.code).toBe("method_not_allowed");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
