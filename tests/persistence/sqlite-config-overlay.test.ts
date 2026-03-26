import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { ConfigStore } from "../../src/config/store.js";
import { createLogger } from "../../src/core/logger.js";
import { closeDatabaseConnection } from "../../src/db/connection.js";

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

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}

function readRows(baseDir: string): Array<{ path: string; valueJson: string }> {
  const db = openDb(baseDir);
  const rows = db.prepare("SELECT path, value_json AS valueJson FROM config_overlays ORDER BY path").all() as Array<{
    path: string;
    valueJson: string;
  }>;
  db.close();
  return rows;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    closeDatabaseConnection({ baseDir: dir });
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ConfigOverlayStore SQLite persistence", () => {
  it("writes overlay leaf entries to SQLite on set", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("agent.model", "gpt-5.4");

    expect(readRows(baseDir)).toEqual([{ path: "agent.model", valueJson: '"gpt-5.4"' }]);
    await store.stop();
  });

  it("keeps SQLite-backed overlay authoritative on restart", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("agent.model", "gpt-5.4");
    await store.stop();

    const db = new Database(path.join(baseDir, "symphony.db"));
    db.prepare("UPDATE config_overlays SET value_json = ? WHERE path = ?").run('"sqlite-value"', "agent.model");
    db.close();

    const restoredStore = await createStore(baseDir);
    expect(restoredStore.toMap()).toEqual({
      agent: { model: "sqlite-value" },
    });
    await restoredStore.stop();
  });

  it("ignores external overlay file edits and keeps SQLite state authoritative", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const overlayPath = path.join(baseDir, "config", "overlay.yaml");
    await store.set("agent.model", "gpt-5.4");

    await writeOverlay(overlayPath, "agent:\n  model: gpt-5.5\npolling:\n  interval: 30000\n");

    await waitFor(() => {
      expect(store.toMap()).toEqual({
        agent: { model: "gpt-5.4" },
      });
      expect(readRows(baseDir)).toEqual([{ path: "agent.model", valueJson: '"gpt-5.4"' }]);
    });
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

    expect(readRows(baseDir)).toEqual([
      { path: "agent.maxConcurrentAgents", valueJson: "4" },
      { path: "codex.model", valueJson: '"o3"' },
      { path: "codex.reasoningEffort", valueJson: '"high"' },
    ]);
    await store.stop();
  });

  it("syncs delete operations to SQLite and persists across restart", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("agent.model", "gpt-5.4");
    await store.set("polling.interval", 30000);
    await store.delete("polling.interval");
    expect(readRows(baseDir)).toEqual([{ path: "agent.model", valueJson: '"gpt-5.4"' }]);
    await store.stop();

    const restoredStore = await createStore(baseDir);
    const overlay = restoredStore.toMap();
    expect(overlay).toEqual({ agent: { model: "gpt-5.4" } });
    expect(overlay).not.toHaveProperty("polling");
    await restoredStore.stop();
  });

  it("reads from SQLite on restart without any feature flag", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.set("agent.model", "gpt-5.4");
    await store.stop();

    const overlayPath = path.join(baseDir, "config", "overlay.yaml");
    await rm(overlayPath, { force: true });

    const sqliteReadStore = await createStore(baseDir);
    expect(sqliteReadStore.toMap()).toEqual({
      agent: { model: "gpt-5.4" },
    });
    await sqliteReadStore.stop();
  });

  it("keeps in-memory state stable when external overlay file edits happen", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const overlayPath = path.join(baseDir, "config", "overlay.yaml");

    await store.set("agent.model", "gpt-5.4");

    await writeOverlay(overlayPath, "agent:\n  model: gpt-5.5\n");

    await waitFor(() => {
      expect(store.toMap()).toEqual({ agent: { model: "gpt-5.4" } });
    });
    await store.stop();
  });

  it("persists SQLite-backed state across restart even after external overlay file edits", async () => {
    const baseDir = await createTempDir();
    const overlayPath = path.join(baseDir, "config", "overlay.yaml");
    const store = await createStore(baseDir);

    await store.set("agent.model", "gpt-5.4");
    await writeOverlay(overlayPath, "agent:\n  model: gpt-5.5\npolling:\n  interval: 30000\n");

    await waitFor(() => {
      expect(store.toMap()).toEqual({
        agent: { model: "gpt-5.4" },
      });
      expect(readRows(baseDir)).toEqual([{ path: "agent.model", valueJson: '"gpt-5.4"' }]);
    });
    await store.stop();

    const rollbackStore = await createStore(baseDir);
    expect(rollbackStore.toMap()).toEqual({
      agent: { model: "gpt-5.4" },
    });
    await rollbackStore.stop();
  });

  it("keeps ConfigStore refresh semantics with SQLite-backed overlay reads", async () => {
    const baseDir = await createTempDir();
    const overlayStore = await createStore(baseDir);
    const workflowPath = path.join(baseDir, "workflow.yaml");
    await writeFile(
      workflowPath,
      `---
tracker:
  kind: linear
  api_key: lin_test
  endpoint: https://api.linear.app/graphql
  project_slug: TEST
  active_states:
    - In Progress
  terminal_states:
    - Done
codex:
  command: codex
  turn_timeout_ms: 30000
  auth:
    mode: api_key
    source_home: /tmp
agent: {}
server: {}
workspace:
  root: /tmp/symphony
---
Work on the issue.
`,
      "utf8",
    );

    const configStore = new ConfigStore(workflowPath, createLogger(), { overlayStore });
    await configStore.start();

    try {
      const listener = vi.fn();
      configStore.subscribe(listener);

      await overlayStore.set("tracker.project_slug", "SQLITE");

      await waitFor(() => {
        expect(configStore.getConfig().tracker.projectSlug).toBe("SQLITE");
        expect(listener).toHaveBeenCalled();
      });
    } finally {
      await configStore.stop();
      await overlayStore.stop();
    }
  });
});

async function writeOverlay(overlayPath: string, source: string): Promise<void> {
  await writeFile(overlayPath, source, "utf8");
}
