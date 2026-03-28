import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AttemptEvent, AttemptRecord } from "../../../src/core/types.js";
import { closeDatabase, openDatabase } from "../../../src/persistence/sqlite/database.js";
import { migrateFromJsonl } from "../../../src/persistence/sqlite/migrator.js";
import { attempts, attemptEvents } from "../../../src/persistence/sqlite/schema.js";
import type { SymphonyDatabase } from "../../../src/persistence/sqlite/database.js";
import { createMockLogger } from "../../helpers.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-migrator-test-"));
  tempDirs.push(dir);
  return dir;
}

function createAttemptRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Test issue",
    workspaceKey: "MT-42",
    workspacePath: "/tmp/symphony/MT-42",
    status: "completed",
    attemptNumber: 1,
    startedAt: "2026-03-16T10:00:00.000Z",
    endedAt: "2026-03-16T10:05:00.000Z",
    model: "gpt-5.4",
    reasoningEffort: "high",
    modelSource: "default",
    threadId: null,
    turnId: null,
    turnCount: 3,
    errorCode: null,
    errorMessage: null,
    tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    pullRequestUrl: null,
    stopSignal: null,
    ...overrides,
  };
}

function createAttemptEvent(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    attemptId: "attempt-1",
    at: "2026-03-16T10:01:00.000Z",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    sessionId: null,
    event: "attempt.updated",
    message: "Processing turn 1",
    content: null,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("migrateFromJsonl", () => {
  let db: SymphonyDatabase;

  afterEach(() => {
    try {
      closeDatabase(db);
    } catch {
      // already closed or not opened
    }
  });

  it("returns zero counts for an empty archive directory", async () => {
    const archiveDir = await createTempDir();
    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result).toEqual({ attemptCount: 0, eventCount: 0 });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns zero counts when attempts/ and events/ are empty", async () => {
    const archiveDir = await createTempDir();
    await mkdir(path.join(archiveDir, "attempts"), { recursive: true });
    await mkdir(path.join(archiveDir, "events"), { recursive: true });
    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result).toEqual({ attemptCount: 0, eventCount: 0 });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("handles missing archive directory gracefully (no attempts/ or events/)", async () => {
    const archiveDir = path.join(os.tmpdir(), "symphony-migrator-nonexistent-" + Date.now());
    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result).toEqual({ attemptCount: 0, eventCount: 0 });
  });

  it("imports valid attempt JSON files", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    await mkdir(attemptsDir, { recursive: true });

    const record = createAttemptRecord();
    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(record));

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.attemptCount).toBe(1);
    expect(result.eventCount).toBe(0);

    const rows = db.select().from(attempts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].attemptId).toBe("attempt-1");
    expect(rows[0].issueIdentifier).toBe("MT-42");
    expect(rows[0].status).toBe("completed");
  });

  it("imports valid event JSONL files", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    const eventsDir = path.join(archiveDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    // Events have a FK to attempts, so we need a parent attempt
    const record = createAttemptRecord();
    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(record));

    const events = [
      createAttemptEvent({ at: "2026-03-16T10:01:00.000Z", event: "attempt.started", message: "started" }),
      createAttemptEvent({ at: "2026-03-16T10:02:00.000Z", event: "attempt.completed", message: "completed" }),
    ];
    await writeFile(path.join(eventsDir, "attempt-1.jsonl"), events.map((e) => JSON.stringify(e)).join("\n"));

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.attemptCount).toBe(1);
    expect(result.eventCount).toBe(2);

    const eventRows = db.select().from(attemptEvents).all();
    expect(eventRows).toHaveLength(2);
    expect(eventRows[0].type).toBe("attempt.started");
    expect(eventRows[1].type).toBe("attempt.completed");
  });

  it("imports multiple attempt files", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    await mkdir(attemptsDir, { recursive: true });

    const record1 = createAttemptRecord({ attemptId: "attempt-1", issueIdentifier: "MT-1" });
    const record2 = createAttemptRecord({ attemptId: "attempt-2", issueIdentifier: "MT-2" });
    const record3 = createAttemptRecord({ attemptId: "attempt-3", issueIdentifier: "MT-3" });

    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(record1));
    await writeFile(path.join(attemptsDir, "attempt-2.json"), JSON.stringify(record2));
    await writeFile(path.join(attemptsDir, "attempt-3.json"), JSON.stringify(record3));

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.attemptCount).toBe(3);

    const rows = db.select().from(attempts).all();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.attemptId).sort()).toEqual(["attempt-1", "attempt-2", "attempt-3"]);
  });

  it("skips non-.json files in attempts directory", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    await mkdir(attemptsDir, { recursive: true });

    const record = createAttemptRecord();
    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(record));
    await writeFile(path.join(attemptsDir, "readme.txt"), "not an attempt");
    await writeFile(path.join(attemptsDir, ".gitkeep"), "");

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.attemptCount).toBe(1);
  });

  it("skips non-.jsonl files in events directory", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    const eventsDir = path.join(archiveDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const record = createAttemptRecord();
    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(record));

    const event = createAttemptEvent();
    await writeFile(path.join(eventsDir, "attempt-1.jsonl"), JSON.stringify(event));
    await writeFile(path.join(eventsDir, "notes.txt"), "not events");

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.eventCount).toBe(1);
  });

  it("logs warning and skips corrupt attempt files", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    await mkdir(attemptsDir, { recursive: true });

    const validRecord = createAttemptRecord({ attemptId: "valid-1" });
    await writeFile(path.join(attemptsDir, "valid-1.json"), JSON.stringify(validRecord));
    await writeFile(path.join(attemptsDir, "corrupt.json"), "{ invalid json ---");

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.attemptCount).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ file: "corrupt.json" }),
      "skipped corrupt attempt file during migration",
    );
  });

  it("logs warning and skips corrupt event files", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    const eventsDir = path.join(archiveDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const record = createAttemptRecord();
    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(record));
    await writeFile(path.join(eventsDir, "corrupt.jsonl"), "{ not valid json");

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.attemptCount).toBe(1);
    expect(result.eventCount).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ file: "corrupt.jsonl" }),
      "skipped corrupt event file during migration",
    );
  });

  it("skips blank lines in JSONL event files", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    const eventsDir = path.join(archiveDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const record = createAttemptRecord();
    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(record));

    const event = createAttemptEvent();
    // JSONL with trailing newline and blank lines
    const content = JSON.stringify(event) + "\n\n  \n";
    await writeFile(path.join(eventsDir, "attempt-1.jsonl"), content);

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.eventCount).toBe(1);
  });

  it("logs info when migration imports records", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    await mkdir(attemptsDir, { recursive: true });

    await writeFile(path.join(attemptsDir, "attempt-1.json"), JSON.stringify(createAttemptRecord()));

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    await migrateFromJsonl(db, archiveDir, logger);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ attemptCount: 1, eventCount: 0 }),
      "JSONL migration completed",
    );
  });

  it("duplicate attempts are silently ignored via ON CONFLICT DO NOTHING", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    await mkdir(attemptsDir, { recursive: true });

    const record = createAttemptRecord({ attemptId: "dup-1" });
    await writeFile(path.join(attemptsDir, "dup-1.json"), JSON.stringify(record));

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    // Migrate once
    const first = await migrateFromJsonl(db, archiveDir, logger);
    expect(first.attemptCount).toBe(1);

    // Migrate again — duplicate should be silently ignored (ON CONFLICT DO NOTHING)
    const second = await migrateFromJsonl(db, archiveDir, logger);
    expect(second.attemptCount).toBe(1);

    const rows = db.select().from(attempts).all();
    expect(rows).toHaveLength(1);
  });

  it("result counts match actual rows in the database", async () => {
    const archiveDir = await createTempDir();
    const attemptsDir = path.join(archiveDir, "attempts");
    const eventsDir = path.join(archiveDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const record1 = createAttemptRecord({ attemptId: "att-1" });
    const record2 = createAttemptRecord({ attemptId: "att-2" });
    await writeFile(path.join(attemptsDir, "att-1.json"), JSON.stringify(record1));
    await writeFile(path.join(attemptsDir, "att-2.json"), JSON.stringify(record2));

    const events1 = [
      createAttemptEvent({ attemptId: "att-1", at: "2026-03-16T10:01:00.000Z", event: "attempt.started" }),
      createAttemptEvent({ attemptId: "att-1", at: "2026-03-16T10:02:00.000Z", event: "attempt.completed" }),
    ];
    const events2 = [
      createAttemptEvent({ attemptId: "att-2", at: "2026-03-16T10:03:00.000Z", event: "attempt.started" }),
    ];
    await writeFile(path.join(eventsDir, "att-1.jsonl"), events1.map((e) => JSON.stringify(e)).join("\n"));
    await writeFile(path.join(eventsDir, "att-2.jsonl"), events2.map((e) => JSON.stringify(e)).join("\n"));

    db = openDatabase(":memory:");
    const logger = createMockLogger();

    const result = await migrateFromJsonl(db, archiveDir, logger);

    expect(result.attemptCount).toBe(2);
    expect(result.eventCount).toBe(3);

    const attemptRows = db.select().from(attempts).all();
    const eventRows = db.select().from(attemptEvents).all();
    expect(attemptRows).toHaveLength(result.attemptCount);
    expect(eventRows).toHaveLength(result.eventCount);
  });
});
