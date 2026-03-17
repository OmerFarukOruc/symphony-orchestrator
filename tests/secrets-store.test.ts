import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../src/logger.js";
import { SecretsStore } from "../src/secrets-store.js";

const tempDirs: string[] = [];
const originalMasterKey = process.env.MASTER_KEY;

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-secrets-store-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  process.env.MASTER_KEY = originalMasterKey;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SecretsStore", () => {
  it("encrypts values at rest and reloads them on restart with the same key", async () => {
    const dir = await createTempDir();
    process.env.MASTER_KEY = "test-master-key";

    const store = new SecretsStore(dir, createLogger());
    await store.start();
    await store.set("LINEAR_API_KEY", "lin_api_secret");
    await store.set("OPENAI_API_KEY", "sk-secret");

    expect(store.list()).toEqual(["LINEAR_API_KEY", "OPENAI_API_KEY"]);
    expect(store.get("LINEAR_API_KEY")).toBe("lin_api_secret");

    const encryptedFile = await readFile(path.join(dir, "secrets.enc"), "utf8");
    expect(encryptedFile).not.toContain("lin_api_secret");
    expect(encryptedFile).not.toContain("sk-secret");
    expect(encryptedFile).toContain('"ciphertext"');

    const restartedStore = new SecretsStore(dir, createLogger());
    await restartedStore.start();
    expect(restartedStore.get("LINEAR_API_KEY")).toBe("lin_api_secret");
    expect(restartedStore.get("OPENAI_API_KEY")).toBe("sk-secret");
  });

  it("records append-only audit events for set/delete without logging secret values", async () => {
    const dir = await createTempDir();
    process.env.MASTER_KEY = "audit-master-key";

    const store = new SecretsStore(dir, createLogger());
    await store.start();
    await store.set("TOKEN", "value-1");
    await store.delete("TOKEN");

    const audit = await readFile(path.join(dir, "secrets.audit.log"), "utf8");
    expect(audit).toContain('"operation":"set"');
    expect(audit).toContain('"operation":"delete"');
    expect(audit).toContain('"key":"TOKEN"');
    expect(audit).not.toContain("value-1");
  });

  it("requires MASTER_KEY at startup", async () => {
    const dir = await createTempDir();
    delete process.env.MASTER_KEY;

    const store = new SecretsStore(dir, createLogger());
    await expect(store.start()).rejects.toThrow("MASTER_KEY");
  });

  it("fails startup when the persisted secrets file is decrypted with the wrong key", async () => {
    const dir = await createTempDir();
    process.env.MASTER_KEY = "key-a";

    const store = new SecretsStore(dir, createLogger());
    await store.start();
    await store.set("TOKEN", "value-1");

    process.env.MASTER_KEY = "key-b";
    const wrongKeyStore = new SecretsStore(dir, createLogger());
    await expect(wrongKeyStore.start()).rejects.toThrow();
  });
});
