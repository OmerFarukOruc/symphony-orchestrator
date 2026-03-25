import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { AttemptStore } from "../../src/core/attempt-store.js";
import { createLogger } from "../../src/core/logger.js";
import type { AttemptEvent, AttemptRecord } from "../../src/core/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-sqlite-attempt-"));
  tempDirs.push(dir);
  return dir;
}

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "SQLite persistence check",
    workspaceKey: "MT-42",
    workspacePath: "/tmp/symphony/MT-42",
    status: "running",
    attemptNumber: 1,
    startedAt: "2026-03-16T10:00:00.000Z",
    endedAt: null,
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: null,
    turnId: null,
    turnCount: 0,
    errorCode: null,
    errorMessage: null,
    tokenUsage: null,
    ...overrides,
  };
}

function createEvent(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    attemptId: "attempt-1",
    at: "2026-03-16T10:00:01.000Z",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    sessionId: null,
    event: "attempt.updated",
    message: "updated",
    content: null,
    ...overrides,
  };
}

async function createStore(baseDir: string): Promise<AttemptStore> {
  const store = new AttemptStore(baseDir, createLogger());
  await store.start();
  return store;
}

function openDb(baseDir: string): Database.Database {
  return new Database(path.join(baseDir, "symphony.db"), { readonly: true });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("AttemptStore SQLite dual-write", () => {
  it("writes attempts to both filesystem and SQLite on createAttempt", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const attempt = createAttempt();

    await store.createAttempt(attempt);

    // Verify filesystem
    const fileContent = JSON.parse(await readFile(path.join(baseDir, "attempts", "attempt-1.json"), "utf8"));
    expect(fileContent).toEqual(attempt);

    // Verify SQLite
    const db = openDb(baseDir);
    const row = db.prepare("SELECT * FROM attempt_rows WHERE attempt_id = ?").get("attempt-1") as {
      attempt_id: string;
      payload: string;
    };
    db.close();

    expect(row).toBeDefined();
    expect(JSON.parse(row.payload)).toEqual(attempt);
  });

  it("writes events to both filesystem and SQLite on appendEvent", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    await store.createAttempt(createAttempt());

    const event = createEvent();
    await store.appendEvent(event);

    // Verify filesystem
    const fileContent = (await readFile(path.join(baseDir, "events", "attempt-1.jsonl"), "utf8")).trim();
    expect(JSON.parse(fileContent)).toEqual(event);

    // Verify SQLite
    const db = openDb(baseDir);
    const rows = db.prepare("SELECT * FROM attempt_event_rows WHERE attempt_id = ?").all("attempt-1") as Array<{
      payload: string;
      position: number;
    }>;
    db.close();

    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBe(0);
    expect(JSON.parse(rows[0].payload)).toEqual(event);
  });

  it("updates both filesystem and SQLite on updateAttempt", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    await store.createAttempt(createAttempt());

    await store.updateAttempt("attempt-1", {
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
    });

    // Verify filesystem
    const fileContent = JSON.parse(
      await readFile(path.join(baseDir, "attempts", "attempt-1.json"), "utf8"),
    ) as AttemptRecord;
    expect(fileContent.status).toBe("completed");
    expect(fileContent.endedAt).toBe("2026-03-16T10:05:00.000Z");

    // Verify SQLite
    const db = openDb(baseDir);
    const row = db.prepare("SELECT payload FROM attempt_rows WHERE attempt_id = ?").get("attempt-1") as {
      payload: string;
    };
    db.close();

    const dbRecord = JSON.parse(row.payload) as AttemptRecord;
    expect(dbRecord.status).toBe("completed");
    expect(dbRecord.endedAt).toBe("2026-03-16T10:05:00.000Z");
  });

  it("restores from SQLite when filesystem archives are deleted", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const attempt = createAttempt();
    const event = createEvent();

    await store.createAttempt(attempt);
    await store.appendEvent(event);

    // Delete filesystem archives but keep the DB
    await rm(path.join(baseDir, "attempts"), { recursive: true, force: true });
    await rm(path.join(baseDir, "events"), { recursive: true, force: true });
    await rm(path.join(baseDir, "issue-index.json"), { force: true });

    // Restart - should restore from SQLite
    const restoredStore = await createStore(baseDir);

    expect(restoredStore.getAttempt("attempt-1")).toEqual(attempt);
    expect(restoredStore.getEvents("attempt-1")).toEqual([event]);
    expect(restoredStore.getAttemptsForIssue("MT-42")).toHaveLength(1);
  });

  it("handles corrupt SQLite rows gracefully", async () => {
    const baseDir = await createTempDir();
    await mkdir(path.join(baseDir, "attempts"), { recursive: true });
    await mkdir(path.join(baseDir, "events"), { recursive: true });

    // Create DB with corrupt data
    const dbPath = path.join(baseDir, "symphony.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS attempt_rows (
        attempt_id TEXT PRIMARY KEY,
        issue_identifier TEXT NOT NULL,
        started_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attempt_event_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
    `);
    db.prepare(`INSERT INTO attempt_rows VALUES (?, ?, ?, ?)`).run(
      "corrupt-1",
      "MT-1",
      "2026-01-01T00:00:00Z",
      "not-valid-json{{{",
    );
    db.close();

    // Should start without crashing, skipping the corrupt row
    const store = await createStore(baseDir);
    expect(store.getAttempt("corrupt-1")).toBeNull();
  });
});
