import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../../../src/core/logger.js";
import type { AttemptEvent, AttemptRecord } from "../../../src/core/types.js";
import { SqliteAttemptStore } from "../../../src/persistence/sqlite/attempt-store-sqlite.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-sqlite-store-test-"));
  tempDirs.push(dir);
  return dir;
}

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Characterize persistence",
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
    pullRequestUrl: null,
    stopSignal: null,
    ...overrides,
  };
}

function createEvent(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    attemptId: "attempt-1",
    at: "2026-03-16T10:00:00.000Z",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    sessionId: null,
    event: "attempt.updated",
    message: "updated",
    content: null,
    ...overrides,
  };
}

async function createStore(dir: string): Promise<SqliteAttemptStore> {
  const dbPath = path.join(dir, "test.db");
  const store = new SqliteAttemptStore(dbPath, createLogger());
  await store.start();
  return store;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SqliteAttemptStore", () => {
  it("creates and retrieves an attempt", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    const attempt = createAttempt();
    await store.createAttempt(attempt);

    expect(store.getAttempt(attempt.attemptId)).toEqual(attempt);
    store.close();
  });

  it("returns null for unknown attempt id", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    expect(store.getAttempt("nonexistent")).toBeNull();
    store.close();
  });

  it("returns all attempts", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    const first = createAttempt({ attemptId: "attempt-1" });
    const second = createAttempt({ attemptId: "attempt-2", attemptNumber: 2 });

    await store.createAttempt(first);
    await store.createAttempt(second);

    const all = store.getAllAttempts();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.attemptId).sort()).toEqual(["attempt-1", "attempt-2"]);
    store.close();
  });

  it("handles duplicate createAttempt calls idempotently", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    const attempt = createAttempt();
    await store.createAttempt(attempt);
    await store.createAttempt(attempt);

    expect(store.getAllAttempts()).toHaveLength(1);
    store.close();
  });

  it("updates an existing attempt", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    const attempt = createAttempt();
    await store.createAttempt(attempt);

    await store.updateAttempt(attempt.attemptId, {
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
      turnCount: 5,
    });

    const updated = store.getAttempt(attempt.attemptId);
    expect(updated).toMatchObject({
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
      turnCount: 5,
      title: "Characterize persistence",
    });
    store.close();
  });

  it("throws when updating a nonexistent attempt", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    await expect(store.updateAttempt("nonexistent", { status: "failed" })).rejects.toThrow("unknown attempt id");
    store.close();
  });

  it("returns attempts for a specific issue", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    const first = createAttempt({
      attemptId: "attempt-1",
      issueIdentifier: "MT-42",
      startedAt: "2026-03-16T10:00:00.000Z",
    });
    const second = createAttempt({
      attemptId: "attempt-2",
      issueIdentifier: "MT-42",
      startedAt: "2026-03-16T11:00:00.000Z",
    });
    const other = createAttempt({
      attemptId: "attempt-3",
      issueIdentifier: "MT-99",
      startedAt: "2026-03-16T10:30:00.000Z",
    });

    await store.createAttempt(first);
    await store.createAttempt(second);
    await store.createAttempt(other);

    const forIssue = store.getAttemptsForIssue("MT-42");
    expect(forIssue).toHaveLength(2);
    // Sorted descending by startedAt
    expect(forIssue[0].attemptId).toBe("attempt-2");
    expect(forIssue[1].attemptId).toBe("attempt-1");

    expect(store.getAttemptsForIssue("MT-99")).toHaveLength(1);
    expect(store.getAttemptsForIssue("NONE")).toEqual([]);
    store.close();
  });

  it("appends and retrieves events in chronological order", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    await store.createAttempt(createAttempt());

    const firstEvent = createEvent({
      at: "2026-03-16T10:01:00.000Z",
      event: "attempt.started",
      message: "started",
    });
    const secondEvent = createEvent({
      at: "2026-03-16T10:02:00.000Z",
      event: "attempt.completed",
      message: "completed",
    });

    await store.appendEvent(firstEvent);
    await store.appendEvent(secondEvent);

    const events = store.getEvents("attempt-1");
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("attempt.started");
    expect(events[1].event).toBe("attempt.completed");
    store.close();
  });

  it("returns empty array for events of unknown attempt", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    expect(store.getEvents("nonexistent")).toEqual([]);
    store.close();
  });

  it("sumArchivedSeconds returns 0 for an empty store", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    expect(store.sumArchivedSeconds()).toBe(0);
    store.close();
  });

  it("sumArchivedSeconds sums completed attempts and ignores incomplete ones", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    const first = createAttempt({
      attemptId: "attempt-1",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:05:00.000Z",
      status: "completed",
    });
    const second = createAttempt({
      attemptId: "attempt-2",
      startedAt: "2026-03-16T11:00:00.000Z",
      endedAt: "2026-03-16T11:02:00.000Z",
      status: "completed",
    });
    // still running — should be excluded
    const running = createAttempt({
      attemptId: "attempt-3",
      startedAt: "2026-03-16T12:00:00.000Z",
      endedAt: null,
      status: "running",
    });

    await store.createAttempt(first);
    await store.createAttempt(second);
    await store.createAttempt(running);

    // 5*60 + 2*60 = 420 seconds
    expect(store.sumArchivedSeconds()).toBeCloseTo(420, 0);
    store.close();
  });

  it("preserves token usage through round-trip", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    const attempt = createAttempt({
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    await store.createAttempt(attempt);

    const retrieved = store.getAttempt(attempt.attemptId);
    expect(retrieved?.tokenUsage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    store.close();
  });

  it("preserves event metadata through round-trip", async () => {
    const dir = await createTempDir();
    const store = await createStore(dir);

    await store.createAttempt(createAttempt());

    const event = createEvent({
      metadata: { exitCode: 0, duration: 1234 },
      usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
    });
    await store.appendEvent(event);

    const events = store.getEvents("attempt-1");
    expect(events[0].metadata).toEqual({ exitCode: 0, duration: 1234 });
    expect(events[0].usage).toEqual({
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
    });
    store.close();
  });

  it("persists data across close/reopen cycles", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "test.db");

    const store1 = new SqliteAttemptStore(dbPath, createLogger());
    await store1.start();
    await store1.createAttempt(createAttempt());
    await store1.appendEvent(createEvent());
    store1.close();

    const store2 = new SqliteAttemptStore(dbPath, createLogger());
    await store2.start();

    expect(store2.getAttempt("attempt-1")).toMatchObject({ attemptId: "attempt-1" });
    expect(store2.getEvents("attempt-1")).toHaveLength(1);
    store2.close();
  });
});

describe("SqliteAttemptStore migration", () => {
  it("migrates JSONL archive files into SQLite", async () => {
    const archiveDir = await createTempDir();

    const attemptsDir = path.join(archiveDir, "attempts");
    const eventsDir = path.join(archiveDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const attempt = createAttempt({
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
    });
    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(attempt, null, 2), "utf8");

    const events = [
      createEvent({ at: "2026-03-16T10:01:00.000Z", event: "attempt.started", message: "started" }),
      createEvent({ at: "2026-03-16T10:02:00.000Z", event: "attempt.completed", message: "completed" }),
    ];
    await writeFile(path.join(eventsDir, "attempt-1.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");

    const dbPath = path.join(archiveDir, "symphony.db");
    const store = new SqliteAttemptStore(dbPath, createLogger());
    await store.start();
    await store.migrateFromArchive(archiveDir);

    expect(store.getAttempt("attempt-1")).toMatchObject({
      attemptId: "attempt-1",
      status: "completed",
    });

    const retrieved = store.getEvents("attempt-1");
    expect(retrieved).toHaveLength(2);
    expect(retrieved[0].event).toBe("attempt.started");
    expect(retrieved[1].event).toBe("attempt.completed");
    store.close();
  });

  it("skips migration when database already has data", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    await mkdir(attemptsDir, { recursive: true });

    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(createAttempt()), "utf8");

    const dbPath = path.join(archiveDir, "symphony.db");
    const store = new SqliteAttemptStore(dbPath, createLogger());
    await store.start();

    // Insert an attempt directly so the DB is non-empty
    await store.createAttempt(createAttempt({ attemptId: "pre-existing" }));

    // Migration should be skipped because the DB has data
    await store.migrateFromArchive(archiveDir);

    // Only the pre-existing attempt should be there, not the JSONL one
    expect(store.getAllAttempts()).toHaveLength(1);
    expect(store.getAttempt("pre-existing")).not.toBeNull();
    expect(store.getAttempt("attempt-1")).toBeNull();
    store.close();
  });

  it("handles missing archive directories gracefully", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "test.db");
    const store = new SqliteAttemptStore(dbPath, createLogger());
    await store.start();

    // Should not throw even with no archive dirs
    await store.migrateFromArchive(path.join(dir, "nonexistent-archive"));
    expect(store.getAllAttempts()).toEqual([]);
    store.close();
  });
});
