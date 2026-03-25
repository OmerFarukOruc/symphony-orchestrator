import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { SecretsStore } from "../../src/secrets/store.js";
import { createLogger } from "../../src/core/logger.js";

const tempDirs: string[] = [];
const MASTER_KEY = "test-master-key-for-sqlite-characterization";

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-sqlite-secrets-"));
  tempDirs.push(dir);
  return dir;
}

async function createStore(baseDir: string): Promise<SecretsStore> {
  const store = new SecretsStore(baseDir, createLogger(), { masterKey: MASTER_KEY });
  await store.start();
  return store;
}

function openDb(baseDir: string): Database.Database {
  return new Database(path.join(baseDir, "symphony.db"), { readonly: true });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SecretsStore SQLite dual-write", () => {
  it("writes encrypted envelope to both filesystem and SQLite on set", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("LINEAR_API_KEY", "lin_test_12345");

    // Verify filesystem
    const fileContent = await readFile(path.join(baseDir, "secrets.enc"), "utf8");
    const fileEnvelope = JSON.parse(fileContent);
    expect(fileEnvelope).toHaveProperty("version", 1);
    expect(fileEnvelope).toHaveProperty("algorithm", "aes-256-gcm");
    expect(fileEnvelope).toHaveProperty("ciphertext");

    // Verify SQLite
    const db = openDb(baseDir);
    const row = db.prepare("SELECT envelope FROM secret_state_rows WHERE id = 1").get() as
      | {
          envelope: string;
        }
      | undefined;
    db.close();

    expect(row).toBeDefined();
    const dbEnvelope = JSON.parse(row!.envelope);
    expect(dbEnvelope).toHaveProperty("version", 1);
    expect(dbEnvelope).toHaveProperty("algorithm", "aes-256-gcm");
  });

  it("writes audit entries to both filesystem and SQLite", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("MY_SECRET", "value");
    await store.delete("MY_SECRET");

    // Verify filesystem audit
    const auditLines = (await readFile(path.join(baseDir, "secrets.audit.log"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { operation: string; key: string });
    expect(auditLines).toHaveLength(2);
    expect(auditLines[0]).toMatchObject({ operation: "set", key: "MY_SECRET" });
    expect(auditLines[1]).toMatchObject({ operation: "delete", key: "MY_SECRET" });

    // Verify SQLite audit
    const db = openDb(baseDir);
    const rows = db.prepare("SELECT operation, key FROM secret_audit_rows ORDER BY id").all() as Array<{
      operation: string;
      key: string;
    }>;
    db.close();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ operation: "set", key: "MY_SECRET" });
    expect(rows[1]).toMatchObject({ operation: "delete", key: "MY_SECRET" });
  });

  it("restores from SQLite when secrets.enc file is deleted", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("LINEAR_API_KEY", "lin_test_secret");
    await store.set("GITHUB_TOKEN", "ghp_test_token");

    // Delete file-based secrets but keep DB
    await rm(path.join(baseDir, "secrets.enc"), { force: true });

    // Restart — should restore from SQLite
    const restoredStore = await createStore(baseDir);

    expect(restoredStore.get("LINEAR_API_KEY")).toBe("lin_test_secret");
    expect(restoredStore.get("GITHUB_TOKEN")).toBe("ghp_test_token");
    expect(restoredStore.list()).toEqual(["GITHUB_TOKEN", "LINEAR_API_KEY"]);
  });

  it("round-trips multiple secrets through SQLite", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const secrets: Record<string, string> = {
      KEY_A: "value_a",
      KEY_B: "value_b",
      KEY_C: "value_c",
    };

    for (const [key, value] of Object.entries(secrets)) {
      await store.set(key, value);
    }

    // Delete everything except DB
    await rm(path.join(baseDir, "secrets.enc"), { force: true });
    await rm(path.join(baseDir, "secrets.audit.log"), { force: true });

    const restoredStore = await createStore(baseDir);
    for (const [key, value] of Object.entries(secrets)) {
      expect(restoredStore.get(key)).toBe(value);
    }
  });
});
