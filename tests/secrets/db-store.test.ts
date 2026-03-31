import { describe, expect, it, beforeEach } from "vitest";

import { openDatabase, closeDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { DbSecretsStore } from "../../src/secrets/db-store.js";
import { createLogger } from "../../src/core/logger.js";

const TEST_MASTER_KEY = "test-master-key-for-unit-tests";

let db: RisolutoDatabase;
let store: DbSecretsStore;

beforeEach(async () => {
  db = openDatabase(":memory:");
  store = new DbSecretsStore(db, createLogger(), { masterKey: TEST_MASTER_KEY });
  await store.start();

  return () => closeDatabase(db);
});

describe("DbSecretsStore", () => {
  it("set and get a secret", async () => {
    await store.set("API_KEY", "sk-12345");
    expect(store.get("API_KEY")).toBe("sk-12345");
  });

  it("returns null for nonexistent key", () => {
    expect(store.get("MISSING")).toBeNull();
  });

  it("overwrites an existing secret", async () => {
    await store.set("API_KEY", "old");
    await store.set("API_KEY", "new");
    expect(store.get("API_KEY")).toBe("new");
  });

  it("deletes a secret and returns true", async () => {
    await store.set("API_KEY", "value");
    const deleted = await store.delete("API_KEY");
    expect(deleted).toBe(true);
    expect(store.get("API_KEY")).toBeNull();
  });

  it("delete returns false for nonexistent key", async () => {
    const deleted = await store.delete("NOPE");
    expect(deleted).toBe(false);
  });

  it("list returns sorted key names", async () => {
    await store.set("ZEBRA", "z");
    await store.set("ALPHA", "a");
    await store.set("MIDDLE", "m");
    expect(store.list()).toEqual(["ALPHA", "MIDDLE", "ZEBRA"]);
  });

  it("list returns empty array when no secrets", () => {
    expect(store.list()).toEqual([]);
  });

  it("isInitialized returns true after start", () => {
    expect(store.isInitialized()).toBe(true);
  });

  it("isInitialized returns false before start", () => {
    const uninit = new DbSecretsStore(db, createLogger());
    expect(uninit.isInitialized()).toBe(false);
  });

  it("reset clears the encryption key", () => {
    store.reset();
    expect(store.isInitialized()).toBe(false);
  });

  it("initializeWithKey sets encryption key", async () => {
    const fresh = new DbSecretsStore(db, createLogger());
    await fresh.initializeWithKey(TEST_MASTER_KEY);
    expect(fresh.isInitialized()).toBe(true);
    // Can read secrets written by the other store
    await store.set("SHARED", "value");
    expect(fresh.get("SHARED")).toBe("value");
  });

  it("subscribe notifies on set", async () => {
    let notified = false;
    store.subscribe(() => {
      notified = true;
    });
    await store.set("KEY", "val");
    expect(notified).toBe(true);
  });

  it("subscribe notifies on delete", async () => {
    await store.set("KEY", "val");
    let notified = false;
    store.subscribe(() => {
      notified = true;
    });
    await store.delete("KEY");
    expect(notified).toBe(true);
  });

  it("unsubscribe stops notifications", async () => {
    let count = 0;
    const unsub = store.subscribe(() => count++);
    await store.set("A", "1");
    expect(count).toBe(1);
    unsub();
    await store.set("B", "2");
    expect(count).toBe(1);
  });

  it("rejects empty key", async () => {
    await expect(store.set("", "value")).rejects.toThrow("secret key must not be empty");
    await expect(store.set("  ", "value")).rejects.toThrow("secret key must not be empty");
  });

  it("data persists across store instances", async () => {
    await store.set("PERSIST_TEST", "survives");

    const store2 = new DbSecretsStore(db, createLogger(), { masterKey: TEST_MASTER_KEY });
    await store2.start();
    expect(store2.get("PERSIST_TEST")).toBe("survives");
  });

  it("different master key cannot decrypt", async () => {
    await store.set("SECRET", "hidden");

    const store2 = new DbSecretsStore(db, createLogger(), { masterKey: "wrong-key" });
    await store2.start();
    expect(store2.get("SECRET")).toBeNull(); // decrypt fails, returns null
  });

  it("handles special characters in values", async () => {
    const special = 'value with "quotes", newlines\n, unicode: , and JSON: {"key": "val"}';
    await store.set("SPECIAL", special);
    expect(store.get("SPECIAL")).toBe(special);
  });
});
