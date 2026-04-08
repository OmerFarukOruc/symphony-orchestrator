import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, closeDatabase } from "../../../src/persistence/sqlite/database.js";
import { seedDefaults, initPersistenceRuntime } from "../../../src/persistence/sqlite/runtime.js";
import { config, promptTemplates } from "../../../src/persistence/sqlite/schema.js";
import { createMockLogger } from "../../helpers.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-runtime-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }),
  );
});

describe("seedDefaults", () => {
  it("seeds the default prompt template when config rows already exist", () => {
    const db = openDatabase(":memory:");
    const now = new Date().toISOString();

    db.insert(config)
      .values({
        key: "system",
        value: JSON.stringify({ setupCompletedAt: null, selectedTemplateId: null }),
        updatedAt: now,
      })
      .run();

    seedDefaults(db);

    const template = db.select().from(promptTemplates).get();
    expect(template?.id).toBe("default");

    const systemRow = db.select().from(config).get();
    expect(systemRow).toBeDefined();
    expect(JSON.parse(systemRow!.value)).toMatchObject({
      selectedTemplateId: "default",
    });

    closeDatabase(db);
  });
});

describe("initPersistenceRuntime", () => {
  it("returns a SQLite-backed runtime with a non-null db", async () => {
    const dataDir = await createTempDir();
    const logger = createMockLogger();

    const runtime = await initPersistenceRuntime({ dataDir, logger });

    expect(runtime.db).not.toBeNull();
    expect(runtime.attemptStore.getAllAttempts()).toEqual([]);

    runtime.close();
  });
});
