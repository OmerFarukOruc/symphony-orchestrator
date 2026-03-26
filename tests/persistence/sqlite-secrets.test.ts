import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { FEATURE_FLAG_SQLITE_SECRET_READS, resetFlags, setFlag } from "../../src/core/feature-flags.js";
import { createLogger } from "../../src/core/logger.js";
import { DualWriteSecretStore } from "../../src/db/secrets-store-sqlite.js";

const tempDirs: string[] = [];
const MASTER_KEY = "test-master-key-for-sqlite-characterization";

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-sqlite-secrets-"));
  tempDirs.push(dir);
  return dir;
}

async function createStore(baseDir: string): Promise<DualWriteSecretStore> {
  const store = new DualWriteSecretStore(baseDir, createLogger(), { masterKey: MASTER_KEY });
  await store.start();
  return store;
}

function openDb(baseDir: string): Database.Database {
  return new Database(path.join(baseDir, "symphony.db"), { readonly: true });
}

afterEach(async () => {
  resetFlags();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SecretsStore SQLite dual-write", () => {
  it("writes encrypted secrets to filesystem and SQLite secrets rows on set", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const secretKey = "TEST_SERVICE_KEY";
    const secretValue = "value-for-test-service";

    await store.store(secretKey, secretValue);

    // Verify filesystem
    const fileContent = await readFile(path.join(baseDir, "secrets.enc"), "utf8");
    const fileEnvelope = JSON.parse(fileContent);
    expect(fileEnvelope).toHaveProperty("version", 1);
    expect(fileEnvelope).toHaveProperty("algorithm", "aes-256-gcm");
    expect(fileEnvelope).toHaveProperty("ciphertext");

    // Verify SQLite
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

  it("preserves append-only audit entries on the filesystem", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.store("MY_SECRET", "value");
    await store.delete("MY_SECRET");

    // Verify filesystem audit
    const auditLines = (await readFile(path.join(baseDir, "secrets.audit.log"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { operation: string; key: string });
    expect(auditLines).toHaveLength(2);
    expect(auditLines[0]).toMatchObject({ operation: "set", key: "MY_SECRET" });
    expect(auditLines[1]).toMatchObject({ operation: "delete", key: "MY_SECRET" });
    expect(auditLines.join("\n")).not.toContain("value");
  });

  it("mirrors append-only audit entries into SQLite audit rows", async () => {
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

  it("keeps file-backed reads authoritative by default", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const secretKey = "TEST_SERVICE_KEY";
    const secretValue = "persisted-test-value";

    await store.store(secretKey, secretValue);
    const restoredStore = await createStore(baseDir);
    expect(restoredStore.get(secretKey)).toBe(secretValue);
    expect(restoredStore.list()).toEqual([secretKey]);
  });

  it("round-trips secrets through restart and can read from SQLite only when flagged", async () => {
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

    setFlag("SQLITE_SECRET_READS", true);
    await rm(path.join(baseDir, "secrets.enc"), { force: true });

    const sqliteReadStore = await createStore(baseDir);
    for (const [key, value] of Object.entries(secrets)) {
      expect(sqliteReadStore.get(key)).toBe(value);
    }
  });

  it("preserves deferred-start initialization semantics when SQLite reads are enabled", async () => {
    const baseDir = await createTempDir();
    const store = new DualWriteSecretStore(baseDir, createLogger(), { masterKey: MASTER_KEY });

    await store.startDeferred();
    await store.initializeWithKey(MASTER_KEY);
    await store.store("SETUP_KEY", "setup-value");

    setFlag(FEATURE_FLAG_SQLITE_SECRET_READS, true);
    const restartedStore = new DualWriteSecretStore(baseDir, createLogger(), { masterKey: MASTER_KEY });
    await restartedStore.startDeferred();
    await restartedStore.initializeWithKey(MASTER_KEY);

    expect(restartedStore.list()).toEqual(["SETUP_KEY"]);
    expect(restartedStore.get("SETUP_KEY")).toBe("setup-value");
  });

  it("falls back cleanly after wrong master key initialization and preserves file rollback path", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.store("ROLLBACK_KEY", "rollback-value");

    const wrongKeyStore = new DualWriteSecretStore(baseDir, createLogger(), { masterKey: "wrong-master-key" });
    setFlag(FEATURE_FLAG_SQLITE_SECRET_READS, true);
    await wrongKeyStore.start();

    expect(wrongKeyStore.list()).toEqual([]);
    expect(wrongKeyStore.get("ROLLBACK_KEY")).toBeNull();

    setFlag(FEATURE_FLAG_SQLITE_SECRET_READS, false);
    const recoveredStore = await createStore(baseDir);
    expect(recoveredStore.list()).toEqual([]);
    expect(recoveredStore.get("ROLLBACK_KEY")).toBeNull();
  });
});
