import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigOverlayStore } from "../../src/config/overlay.js";
import { createLogger } from "../../src/core/logger.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-config-overlay-test-"));
  tempDirs.push(dir);
  return dir;
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
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ConfigOverlayStore", () => {
  it("persists set/delete updates and reloads from disk on restart", async () => {
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

    const persisted = await readFile(overlayPath, "utf8");
    expect(persisted).toContain("codex:");
    expect(persisted).toContain("server:");

    await store.delete("codex.model");
    expect(store.toMap()).toEqual({
      server: { port: 4010 },
    });

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

  it("reloads after external file edits and keeps last known good map on invalid edits", async () => {
    const dir = await createTempDir();
    const overlayPath = path.join(dir, "config", "overlay.yaml");
    const store = new ConfigOverlayStore(overlayPath, createLogger());
    await store.start();
    await store.set("agent.max_turns", 10);

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    await writeFile(overlayPath, "agent:\n  max_turns: 20\n", "utf8");
    await waitFor(() => {
      expect(store.toMap()).toEqual({
        agent: {
          max_turns: 20,
        },
      });
    });

    const notificationsBeforeInvalidWrite = notifications;
    await writeFile(overlayPath, "agent: [\n", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(store.toMap()).toEqual({
      agent: {
        max_turns: 20,
      },
    });
    expect(notifications).toBe(notificationsBeforeInvalidWrite);

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
});
