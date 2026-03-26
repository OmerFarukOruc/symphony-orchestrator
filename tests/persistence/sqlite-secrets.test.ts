import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../../src/core/logger.js";
import { closeDatabaseConnection } from "../../src/db/connection.js";
import { SecretsStoreSqlite } from "../../src/db/secrets-store-sqlite.js";

const tempDirs: string[] = [];
const MASTER_KEY = "test-master-key-for-sqlite-characterization";

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-sqlite-secrets-"));
  tempDirs.push(dir);
  return dir;
}

async function createStore(baseDir: string): Promise<SecretsStoreSqlite> {
  const store = new SecretsStoreSqlite(baseDir, createLogger(), { masterKey: MASTER_KEY });
  await store.start();
  return store;
}

function openDb(baseDir: string): Database.Database {
  return new Database(path.join(baseDir, "symphony.db"), { readonly: true });
}

afterEach(async () => {
  for (const dir of tempDirs) {
    closeDatabaseConnection({ baseDir: dir });
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SecretsStore SQLite persistence", () => {
  it("writes encrypted secrets to SQLite secrets rows on set", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const secretKey = "TEST_SERVICE_KEY";
    const secretValue = "value-for-test-service";

    await store.store(secretKey, secretValue);

    const db = openDb(baseDir);
    const row = db
      .prepare("SELECT key, algorithm, iv, auth_tag, ciphertext, version FROM secrets WHERE key = ?")
      .get(secretKey) as
      | {
          key: string;
          algorithm: string;
          iv: string;
          auth_tag: string;
          ciphertext: string;
          version: number;
        }
      | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row).toMatchObject({
      key: secretKey,
      algorithm: "aes-256-gcm",
      version: 1,
    });
    expect(row!.ciphertext).not.toContain(secretValue);
  });

  it("persists append-only audit entries in SQLite", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.store("MY_SECRET", "value");
    await store.delete("MY_SECRET");

    const db = openDb(baseDir);
    const rows = db.prepare("SELECT operation, key FROM secret_audit_rows ORDER BY id ASC").all() as Array<{
      operation: string;
      key: string;
    }>;
    db.close();

    expect(rows).toEqual([
      { operation: "set", key: "MY_SECRET" },
      { operation: "delete", key: "MY_SECRET" },
    ]);
  });

  it("round-trips secrets through restart", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const secretKey = "TEST_SERVICE_KEY";
    const secretValue = "persisted-test-value";

    await store.store(secretKey, secretValue);
    const restoredStore = await createStore(baseDir);
    expect(restoredStore.get(secretKey)).toBe(secretValue);
    expect(restoredStore.list()).toEqual([secretKey]);
  });

  it("keeps restart reads working when only SQLite data exists", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const secrets: Record<string, string> = {
      KEY_A: "value_a",
      KEY_B: "value_b",
      KEY_C: "value_c",
    };

    for (const [key, value] of Object.entries(secrets)) {
      await store.store(key, value);
    }

    const restartedStore = await createStore(baseDir);
    for (const [key, value] of Object.entries(secrets)) {
      expect(restartedStore.get(key)).toBe(value);
    }
  });

  it("preserves deferred-start initialization semantics", async () => {
    const baseDir = await createTempDir();
    const store = new SecretsStoreSqlite(baseDir, createLogger(), { masterKey: MASTER_KEY });

    await store.startDeferred();
    await store.initializeWithKey(MASTER_KEY);
    await store.store("SETUP_KEY", "setup-value");

    const restartedStore = new SecretsStoreSqlite(baseDir, createLogger(), { masterKey: MASTER_KEY });
    await restartedStore.startDeferred();
    await restartedStore.initializeWithKey(MASTER_KEY);

    expect(restartedStore.list()).toEqual(["SETUP_KEY"]);
    expect(restartedStore.get("SETUP_KEY")).toBe("setup-value");
  });

  it("refuses to overwrite unreadable data after wrong master key initialization", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.store("ROLLBACK_KEY", "rollback-value");

    const wrongKeyStore = new SecretsStoreSqlite(baseDir, createLogger(), { masterKey: "wrong-master-key" });
    await expect(wrongKeyStore.start()).rejects.toThrow("MASTER_KEY may not match");

    const recoveredStore = await createStore(baseDir);
    expect(recoveredStore.list()).toEqual(["ROLLBACK_KEY"]);
    expect(recoveredStore.get("ROLLBACK_KEY")).toBe("rollback-value");
  });
});
