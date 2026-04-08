import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/core/logger.js";
import { SqliteAttemptStore } from "../../src/persistence/sqlite/attempt-store-sqlite.js";
import { closeDatabase, openDatabase } from "../../src/persistence/sqlite/database.js";
import { runAttemptStoreContract } from "./attempt-store-contract.js";

type DisposableStore<T> = T & {
  cleanup(): Promise<void>;
};

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("AttemptStorePort contract suites", () => {
  it("registers shared contract suite for the SQLite persistence adapter", () => {
    expect(typeof runAttemptStoreContract).toBe("function");
  });

  runAttemptStoreContract("sqlite", {
    async create() {
      const dir = await createTempDir("risoluto-attempt-store-contract-sqlite-");
      const db = openDatabase(path.join(dir, "risoluto.db"));
      const store = new SqliteAttemptStore(db, createLogger()) as DisposableStore<SqliteAttemptStore>;
      await store.start();
      store.cleanup = async () => {
        closeDatabase(db);
        await rm(dir, { recursive: true, force: true });
      };
      return store;
    },
    async teardown(store) {
      await store.cleanup();
    },
  });
});
