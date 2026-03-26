import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../../src/core/logger.js";
import { closeDatabaseConnection } from "../../src/db/connection.js";
import { SecretsStore } from "../../src/secrets/store.js";

const tempDirs: string[] = [];
const originalMasterKey = process.env.MASTER_KEY;

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-secrets-store-test-"));
  tempDirs.push(dir);
  return dir;
}

function openDb(baseDir: string): Database.Database {
  return new Database(path.join(baseDir, "symphony.db"), { readonly: true });
}

afterEach(async () => {
  process.env.MASTER_KEY = originalMasterKey;
  for (const dir of tempDirs) {
    closeDatabaseConnection({ baseDir: dir });
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SecretsStore", () => {
  it("encrypts values at rest in SQLite and reloads them on restart with the same key", async () => {
    const dir = await createTempDir();
    process.env.MASTER_KEY = "test-master-key";

    const store = new SecretsStore(dir, createLogger());
    await store.start();
    await store.set("LINEAR_API_KEY", "lin_api_secret");
    await store.set("OPENAI_API_KEY", "sk-secret");

    expect(store.list()).toEqual(["LINEAR_API_KEY", "OPENAI_API_KEY"]);
    expect(store.get("LINEAR_API_KEY")).toBe("lin_api_secret");

    const db = openDb(dir);
    const rows = db.prepare("SELECT key, algorithm, ciphertext FROM secrets ORDER BY key ASC").all() as Array<{
      key: string;
      algorithm: string;
      ciphertext: string;
    }>;
    db.close();

    expect(rows.map((row) => row.key)).toEqual(["LINEAR_API_KEY", "OPENAI_API_KEY"]);
    expect(rows.every((row) => row.algorithm === "aes-256-gcm")).toBe(true);
    expect(rows.some((row) => row.ciphertext.includes("lin_api_secret"))).toBe(false);
    expect(rows.some((row) => row.ciphertext.includes("sk-secret"))).toBe(false);

    const restartedStore = new SecretsStore(dir, createLogger());
    await restartedStore.start();
    expect(restartedStore.get("LINEAR_API_KEY")).toBe("lin_api_secret");
    expect(restartedStore.get("OPENAI_API_KEY")).toBe("sk-secret");
  });

  it("records append-only audit events in SQLite without logging secret values", async () => {
    const dir = await createTempDir();
    process.env.MASTER_KEY = "audit-master-key";

    const store = new SecretsStore(dir, createLogger());
    await store.start();
    await store.set("TOKEN", "value-1");
    await store.delete("TOKEN");

    const db = openDb(dir);
    const auditRows = db.prepare("SELECT operation, key FROM secret_audit_rows ORDER BY id ASC").all() as Array<{
      operation: string;
      key: string;
    }>;
    const secretRows = db.prepare("SELECT ciphertext FROM secrets ORDER BY key ASC").all() as Array<{
      ciphertext: string;
    }>;
    db.close();

    expect(auditRows).toEqual([
      { operation: "set", key: "TOKEN" },
      { operation: "delete", key: "TOKEN" },
    ]);
    expect(secretRows.some((row) => row.ciphertext.includes("value-1"))).toBe(false);
  });

  it("requires MASTER_KEY at startup", async () => {
    const dir = await createTempDir();
    delete process.env.MASTER_KEY;

    const store = new SecretsStore(dir, createLogger());
    await expect(store.start()).rejects.toThrow("MASTER_KEY");
  });

  it("refuses to overwrite existing secrets when started with the wrong key", async () => {
    const dir = await createTempDir();
    process.env.MASTER_KEY = "key-a";

    const store = new SecretsStore(dir, createLogger());
    await store.start();
    await store.set("TOKEN", "value-1");
    const beforeDb = openDb(dir);
    const originalRow = beforeDb.prepare("SELECT ciphertext FROM secrets WHERE key = ?").get("TOKEN") as {
      ciphertext: string;
    };
    beforeDb.close();

    process.env.MASTER_KEY = "key-b";
    const wrongKeyStore = new SecretsStore(dir, createLogger());
    await expect(wrongKeyStore.start()).rejects.toThrow("MASTER_KEY may not match");

    const afterDb = openDb(dir);
    const rowAfterFailure = afterDb.prepare("SELECT ciphertext FROM secrets WHERE key = ?").get("TOKEN") as {
      ciphertext: string;
    };
    afterDb.close();
    expect(rowAfterFailure.ciphertext).toBe(originalRow.ciphertext);

    process.env.MASTER_KEY = "key-a";
    const restartedStore = new SecretsStore(dir, createLogger());
    await restartedStore.start();
    expect(restartedStore.get("TOKEN")).toBe("value-1");
  });
});
