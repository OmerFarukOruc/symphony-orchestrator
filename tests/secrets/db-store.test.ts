import { describe, expect, it, beforeEach } from "vitest";

import { openDatabase, closeDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { DbSecretsStore } from "../../src/secrets/db-store.js";
import { createMockLogger } from "../helpers.js";
import type { RisolutoLogger } from "../../src/core/types.js";

const TEST_MASTER_KEY = "test-master-key-for-unit-tests";

let db: RisolutoDatabase;
let store: DbSecretsStore;
let logger: RisolutoLogger;

beforeEach(async () => {
  db = openDatabase(":memory:");
  logger = createMockLogger();
  store = new DbSecretsStore(db, logger, { masterKey: TEST_MASTER_KEY });
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
    const uninit = new DbSecretsStore(db, createMockLogger());
    expect(uninit.isInitialized()).toBe(false);
  });

  it("reset clears the encryption key", () => {
    store.reset();
    expect(store.isInitialized()).toBe(false);
  });

  it("initializeWithKey sets encryption key", async () => {
    const fresh = new DbSecretsStore(db, createMockLogger());
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

    const store2 = new DbSecretsStore(db, createMockLogger(), { masterKey: TEST_MASTER_KEY });
    await store2.start();
    expect(store2.get("PERSIST_TEST")).toBe("survives");
  });

  it("different master key cannot decrypt", async () => {
    await store.set("SECRET", "hidden");

    const wrongLogger = createMockLogger();
    const store2 = new DbSecretsStore(db, wrongLogger, { masterKey: "wrong-key" });
    await store2.start();
    expect(store2.get("SECRET")).toBeNull(); // decrypt fails, returns null
    expect(wrongLogger.warn).toHaveBeenCalledTimes(1);
    expect(wrongLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "SECRET",
        error: expect.any(String),
      }),
      "failed to decrypt secret",
    );
  });

  it("handles special characters in values", async () => {
    const special = 'value with "quotes", newlines\n, unicode: , and JSON: {"key": "val"}';
    await store.set("SPECIAL", special);
    expect(store.get("SPECIAL")).toBe(special);
  });

  it("throws the startup error when neither options.masterKey nor MASTER_KEY is provided", async () => {
    delete process.env.MASTER_KEY;
    const unstarted = new DbSecretsStore(db, createMockLogger());

    await expect(unstarted.start()).rejects.toThrow("MASTER_KEY is required to initialize DbSecretsStore");
    expect(unstarted.isInitialized()).toBe(false);
  });

  it("uses process.env.MASTER_KEY when options.masterKey is absent", async () => {
    process.env.MASTER_KEY = TEST_MASTER_KEY;
    const envBacked = new DbSecretsStore(db, createMockLogger());

    await envBacked.start();
    await store.set("ENV_SHARED", "value");
    expect(envBacked.get("ENV_SHARED")).toBe("value");
  });

  it("throws the required-key error when set is called before start", async () => {
    const unstarted = new DbSecretsStore(db, createMockLogger(), { masterKey: TEST_MASTER_KEY });

    await expect(unstarted.set("API_KEY", "value")).rejects.toThrow("DbSecretsStore has not been started");
  });

  it("list returns only sorted string keys even after updates", async () => {
    await store.set("BETA", "1");
    await store.set("ALPHA", "2");
    await store.set("BETA", "3");

    const keys = store.list();
    expect(keys).toEqual(["ALPHA", "BETA"]);
    expect(keys.every((key) => typeof key === "string")).toBe(true);
  });

  it("sorts key names even when the database returns them out of order", () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          all: () => [{ key: "ZEBRA" }, { key: "ALPHA" }, { key: "MIDDLE" }],
        }),
      }),
    } as unknown as RisolutoDatabase;
    const fakeStore = new DbSecretsStore(fakeDb, createMockLogger(), { masterKey: TEST_MASTER_KEY });

    expect(fakeStore.list()).toEqual(["ALPHA", "MIDDLE", "ZEBRA"]);
  });
});
