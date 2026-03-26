import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttemptEvent, AttemptRecord, AttemptStore } from "@symphony/shared";

import { DualWriteAttemptStore } from "../../src/core/dual-write-store.js";
import { FEATURE_FLAG_SQLITE_READS, resetFlags, setFlag } from "../../src/core/feature-flags.js";
import { createMockLogger } from "../helpers.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-dual-write-store-"));
  tempDirs.push(dir);
  return dir;
}

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "DW-42",
    title: "Dual write",
    workspaceKey: "DW-42",
    workspacePath: "/tmp/symphony/DW-42",
    status: "running",
    attemptNumber: 1,
    startedAt: "2026-03-26T10:00:00.000Z",
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
    at: "2026-03-26T10:01:00.000Z",
    issueId: "issue-1",
    issueIdentifier: "DW-42",
    sessionId: null,
    event: "attempt.updated",
    message: "updated",
    content: null,
    ...overrides,
  };
}

function createMemoryStore(): AttemptStore {
  const attempts = new Map<string, AttemptRecord>();
  const events = new Map<string, AttemptEvent[]>();

  return {
    getAttempt(attemptId) {
      return attempts.get(attemptId) ?? null;
    },
    getAllAttempts() {
      return [...attempts.values()];
    },
    getEvents(attemptId) {
      return [...(events.get(attemptId) ?? [])];
    },
    getAttemptsForIssue(issueIdentifier) {
      return [...attempts.values()]
        .filter((attempt) => attempt.issueIdentifier === issueIdentifier)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    },
    async createAttempt(attempt) {
      attempts.set(attempt.attemptId, attempt);
      events.set(attempt.attemptId, []);
    },
    async updateAttempt(attemptId, patch) {
      const current = attempts.get(attemptId);
      if (!current) {
        throw new Error(`unknown attempt id: ${attemptId}`);
      }
      attempts.set(attemptId, { ...current, ...patch });
    },
    async appendEvent(event) {
      const current = events.get(event.attemptId) ?? [];
      current.push(event);
      events.set(event.attemptId, current);
    },
  };
}

afterEach(async () => {
  resetFlags();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("DualWriteAttemptStore", () => {
  it("keeps file reads authoritative by default while writing attempts and events through to SQLite", async () => {
    const baseDir = await createTempDir();
    const logger = createMockLogger();
    const store = new DualWriteAttemptStore(baseDir, logger);
    await store.start();

    const attempt = createAttempt();
    const event = createEvent();

    await store.createAttempt(attempt);
    await store.appendEvent(event);
    await store.updateAttempt(attempt.attemptId, {
      status: "completed",
      endedAt: "2026-03-26T10:05:00.000Z",
    });

    expect(store.getAttempt(attempt.attemptId)).toMatchObject({
      attemptId: attempt.attemptId,
      status: "completed",
      endedAt: "2026-03-26T10:05:00.000Z",
    });
    expect(store.getAttemptsForIssue(attempt.issueIdentifier)).toHaveLength(1);
    expect(store.getEvents(attempt.attemptId)).toEqual([event]);

    const attemptArchive = JSON.parse(
      await readFile(path.join(baseDir, "attempts", `${attempt.attemptId}.json`), "utf8"),
    ) as AttemptRecord;
    expect(attemptArchive.status).toBe("completed");

    const eventArchive = (await readFile(path.join(baseDir, "events", `${attempt.attemptId}.jsonl`), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as AttemptEvent);
    expect(eventArchive).toEqual([event]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("uses SQLite reads when SQLITE_READS is enabled", async () => {
    const baseDir = await createTempDir();
    const logger = createMockLogger();
    const fileStore = createMemoryStore();
    const sqliteStore = createMemoryStore();
    const store = new DualWriteAttemptStore(baseDir, logger, { fileStore, sqliteStore });
    const attempt = createAttempt();

    await store.createAttempt(attempt);
    await fileStore.updateAttempt(attempt.attemptId, { status: "failed" });
    await sqliteStore.updateAttempt(attempt.attemptId, { status: "completed" });
    await fileStore.appendEvent(createEvent({ message: "file-event" }));
    await sqliteStore.appendEvent(createEvent({ message: "sqlite-event" }));

    setFlag(FEATURE_FLAG_SQLITE_READS, true);

    expect(store.getAttempt(attempt.attemptId)?.status).toBe("completed");
    expect(store.getAllAttempts()).toMatchObject([{ attemptId: attempt.attemptId, status: "completed" }]);
    expect(store.getAttemptsForIssue(attempt.issueIdentifier)).toMatchObject([
      { attemptId: attempt.attemptId, status: "completed" },
    ]);
    expect(store.getEvents(attempt.attemptId)).toMatchObject([{ message: "sqlite-event" }]);
  });

  it("falls back to file reads when SQLITE_READS is enabled but SQLite data is missing", async () => {
    const baseDir = await createTempDir();
    const logger = createMockLogger();
    const fileStore = createMemoryStore();
    const sqliteStore = createMemoryStore();
    const store = new DualWriteAttemptStore(baseDir, logger, { fileStore, sqliteStore });
    const attempt = createAttempt();
    const event = createEvent();

    await fileStore.createAttempt(attempt);
    await fileStore.appendEvent(event);
    setFlag(FEATURE_FLAG_SQLITE_READS, true);

    expect(store.getAttempt(attempt.attemptId)).toEqual(attempt);
    expect(store.getAllAttempts()).toEqual([attempt]);
    expect(store.getAttemptsForIssue(attempt.issueIdentifier)).toEqual([attempt]);
    expect(store.getEvents(attempt.attemptId)).toEqual([event]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "getAttempt",
        fileValue: attempt,
        sqliteValue: null,
      }),
      "sqlite attempt read missing data; falling back to file store",
    );
  });

  it("logs mismatches discovered by write-through verification", async () => {
    const baseDir = await createTempDir();
    const logger = createMockLogger();
    const fileStore = createMemoryStore();
    const sqliteStore = createMemoryStore();
    const store = new DualWriteAttemptStore(baseDir, logger, { fileStore, sqliteStore });
    const sqliteGetAttempt = vi.spyOn(sqliteStore, "getAttempt").mockReturnValue(null);

    const attempt = createAttempt();
    await store.createAttempt(attempt);

    expect(sqliteGetAttempt).toHaveBeenCalledWith(attempt.attemptId);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "createAttempt",
        scope: "attempt",
        attemptId: attempt.attemptId,
        issueIdentifier: attempt.issueIdentifier,
        fileValue: attempt,
        sqliteValue: null,
      }),
      "dual-write verification mismatch detected",
    );
  });
});
