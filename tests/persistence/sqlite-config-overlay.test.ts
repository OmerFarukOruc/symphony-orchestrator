import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { createLogger } from "../../src/core/logger.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-sqlite-config-"));
  tempDirs.push(dir);
  return dir;
}

async function createStore(baseDir: string): Promise<ConfigOverlayStore> {
  const overlayPath = path.join(baseDir, "config", "overlay.yaml");
  const store = new ConfigOverlayStore(overlayPath, createLogger());
  await store.start();
  return store;
}

function openDb(baseDir: string): Database.Database {
  return new Database(path.join(baseDir, "symphony.db"), { readonly: true });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ConfigOverlayStore SQLite dual-write", () => {
  it("writes overlay to SQLite on set", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("agent.model", "gpt-5.4");

    // Verify SQLite
    const db = openDb(baseDir);
    const row = db.prepare("SELECT payload FROM config_overlay_rows WHERE id = 1").get() as
      | {
          payload: string;
        }
      | undefined;
    db.close();

    expect(row).toBeDefined();
    const overlay = JSON.parse(row!.payload);
    expect(overlay).toEqual({ agent: { model: "gpt-5.4" } });
    await store.stop();
  });

  it("restores from SQLite when overlay.yaml is deleted", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("agent.model", "gpt-5.4");
    await store.set("polling.interval", 30000);
    await store.stop();

    // Delete file-based overlay but keep DB
    await rm(path.join(baseDir, "config", "overlay.yaml"), { force: true });

    // Restart — should restore from SQLite
    const restoredStore = await createStore(baseDir);
    const overlay = restoredStore.toMap();
    expect(overlay).toEqual({
      agent: { model: "gpt-5.4" },
      polling: { interval: 30000 },
    });
    await restoredStore.stop();
  });

  it("handles corrupt SQLite overlay rows gracefully", async () => {
    const baseDir = await createTempDir();

    // Create DB with corrupt config row
    const dbPath = path.join(baseDir, "symphony.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS config_overlay_rows (
        id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO config_overlay_rows VALUES (1, ?)").run("not-valid-json{{{");
    db.close();

    // Should start without crashing, falling back to empty overlay
    const store = await createStore(baseDir);
    expect(store.toMap()).toEqual({});
    await store.stop();
  });

  it("persists batch operations atomically to SQLite", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.setBatch([
      { path: "codex.model", value: "o3" },
      { path: "codex.reasoningEffort", value: "high" },
      { path: "agent.maxConcurrentAgents", value: 4 },
    ]);

    // Verify single SQLite write
    const db = openDb(baseDir);
    const row = db.prepare("SELECT payload FROM config_overlay_rows WHERE id = 1").get() as {
      payload: string;
    };
    db.close();

    const overlay = JSON.parse(row.payload);
    expect(overlay).toEqual({
      codex: { model: "o3", reasoningEffort: "high" },
      agent: { maxConcurrentAgents: 4 },
    });
    await store.stop();
  });

  it("syncs delete operations to SQLite", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("agent.model", "gpt-5.4");
    await store.set("polling.interval", 30000);
    await store.delete("polling.interval");
    await store.stop();

    // Delete file, restart from DB
    await rm(path.join(baseDir, "config", "overlay.yaml"), { force: true });

    const restoredStore = await createStore(baseDir);
    const overlay = restoredStore.toMap();
    expect(overlay).toEqual({ agent: { model: "gpt-5.4" } });
    expect(overlay).not.toHaveProperty("polling");
    await restoredStore.stop();
  });
});
