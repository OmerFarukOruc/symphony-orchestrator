import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { createLogger } from "../../src/core/logger.js";
import { closeDatabaseConnection } from "../../src/db/connection.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-config-overlay-test-"));
  tempDirs.push(dir);
  return dir;
}

function readRows(baseDir: string): Array<{ path: string; valueJson: string }> {
  const db = new Database(path.join(baseDir, "symphony.db"), { readonly: true });
  const rows = db.prepare("SELECT path, value_json AS valueJson FROM config_overlays ORDER BY path").all() as Array<{
    path: string;
    valueJson: string;
  }>;
  db.close();
  return rows;
}

async function waitFor(assertion: () => Promise<void> | void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    closeDatabaseConnection({ baseDir: dir });
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ConfigOverlayStore", () => {
  it("persists set/delete updates in SQLite and reloads them on restart", async () => {
    const dir = await createTempDir();
    const overlayPath = path.join(dir, "config", "overlay.yaml");
    const store = new ConfigOverlayStore(overlayPath, createLogger());
    await store.start();

    await store.set("codex.model", "gpt-5.4");
    await store.set("server.port", 4010);

    expect(store.toMap()).toEqual({
      codex: { model: "gpt-5.4" },
      server: { port: 4010 },
    });

    expect(readRows(dir)).toEqual([
      { path: "codex.model", valueJson: '"gpt-5.4"' },
      { path: "server.port", valueJson: "4010" },
    ]);

    await store.delete("codex.model");
    expect(store.toMap()).toEqual({
      server: { port: 4010 },
    });
    expect(readRows(dir)).toEqual([{ path: "server.port", valueJson: "4010" }]);

    await store.stop();

    const restartedStore = new ConfigOverlayStore(overlayPath, createLogger());
    await restartedStore.start();
    expect(restartedStore.toMap()).toEqual({
      server: { port: 4010 },
    });
    await restartedStore.stop();
  });

  it("applies object patches deeply without dropping sibling keys", async () => {
    const dir = await createTempDir();
    const overlayPath = path.join(dir, "config", "overlay.yaml");
    const store = new ConfigOverlayStore(overlayPath, createLogger());
    await store.start();

    await store.applyPatch({
      codex: {
        model: "gpt-5.4",
        reasoning_effort: "high",
      },
    });
    await store.applyPatch({
      codex: {
        model: "gpt-5.5",
      },
    });

    expect(store.toMap()).toEqual({
      codex: {
        model: "gpt-5.5",
        reasoning_effort: "high",
      },
    });
    await store.stop();
  });

  it("ignores external overlay file edits and keeps SQLite-backed state authoritative", async () => {
    const dir = await createTempDir();
    const overlayPath = path.join(dir, "config", "overlay.yaml");
    const store = new ConfigOverlayStore(overlayPath, createLogger());
    await store.start();
    await store.set("agent.max_turns", 10);

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    await waitFor(() => {
      expect(store.toMap()).toEqual({
        agent: {
          max_turns: 10,
        },
      });
    });

    const notificationsBeforeWrite = notifications;
    const db = new Database(path.join(dir, "symphony.db"));
    db.prepare("UPDATE config_overlays SET value_json = ? WHERE path = ?").run("20", "agent.max_turns");
    db.close();
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(store.toMap()).toEqual({
      agent: {
        max_turns: 10,
      },
    });
    expect(notifications).toBe(notificationsBeforeWrite);

    unsubscribe();
    await store.stop();
  });
  it("rejects prototype-polluting keys with TypeError", async () => {
    const dir = await createTempDir();
    const overlayPath = path.join(dir, "config", "overlay.yaml");
    const store = new ConfigOverlayStore(overlayPath, createLogger());
    await store.start();

    await expect(store.set("__proto__.polluted", true)).rejects.toThrow(TypeError);
    await expect(store.set("constructor.polluted", true)).rejects.toThrow(TypeError);
    await expect(store.set("prototype.polluted", true)).rejects.toThrow(TypeError);
    await expect(store.set("safe.__proto__", true)).rejects.toThrow(TypeError);

    expect(store.toMap()).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    await store.stop();
  });

  it("setBatch applies multiple keys atomically in a single SQLite persist cycle", async () => {
    const dir = await createTempDir();
    const overlayPath = path.join(dir, "config", "overlay.yaml");
    const store = new ConfigOverlayStore(overlayPath, createLogger());
    await store.start();

    await store.setBatch([
      { path: "codex.auth.mode", value: "openai_login" },
      { path: "codex.auth.source_home", value: "/tmp/auth-dir" },
      { path: "server.port", value: 4010 },
    ]);

    expect(store.toMap()).toEqual({
      codex: { auth: { mode: "openai_login", source_home: "/tmp/auth-dir" } },
      server: { port: 4010 },
    });

    expect(readRows(dir)).toEqual([
      { path: "codex.auth.mode", valueJson: '"openai_login"' },
      { path: "codex.auth.source_home", valueJson: '"/tmp/auth-dir"' },
      { path: "server.port", valueJson: "4010" },
    ]);

    await store.stop();
  });

  it("setBatch supports combined set and delete operations", async () => {
    const dir = await createTempDir();
    const overlayPath = path.join(dir, "config", "overlay.yaml");
    const store = new ConfigOverlayStore(overlayPath, createLogger());
    await store.start();

    await store.set("codex.provider.name", "old-provider");
    await store.set("codex.auth.mode", "api_key");

    await store.setBatch(
      [
        { path: "codex.auth.mode", value: "openai_login" },
        { path: "codex.auth.source_home", value: "/auth" },
      ],
      ["codex.provider"],
    );

    const map = store.toMap();
    expect(map).toEqual({
      codex: { auth: { mode: "openai_login", source_home: "/auth" } },
    });

    await store.stop();
  });
});
