import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AttemptStore } from "../../src/core/attempt-store.js";
import { createLogger } from "../../src/core/logger.js";
import type { AttemptEvent, AttemptRecord } from "../../src/core/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "symphony-attempt-store-test-"));
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

async function createStore(baseDir: string): Promise<AttemptStore> {
  const store = new AttemptStore(baseDir, createLogger());
  await store.start();
  return store;
}

async function waitFor(assertion: () => Promise<void> | void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("AttemptStore", () => {
  it("persists attempt archives and creates empty event files on createAttempt", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const attempt = createAttempt();

    await store.createAttempt(attempt);

    expect(store.getAttempt(attempt.attemptId)).toEqual(attempt);

    const attemptArchive = JSON.parse(
      await readFile(path.join(baseDir, "attempts", `${attempt.attemptId}.json`), "utf8"),
    );
    expect(attemptArchive).toEqual(attempt);

    const eventArchivePath = path.join(baseDir, "events", `${attempt.attemptId}.jsonl`);
    expect(await readFile(eventArchivePath, "utf8")).toBe("");

    const issueIndex = JSON.parse(await readFile(path.join(baseDir, "issue-index.json"), "utf8")) as Record<
      string,
      string[]
    >;
    expect(issueIndex).toEqual({
      "MT-42": [attempt.attemptId],
    });

    expect((await readdir(baseDir)).sort()).toEqual(["attempts", "events", "issue-index.json"]);
    expect(await readdir(path.join(baseDir, "attempts"))).toEqual([`${attempt.attemptId}.json`]);
    expect(await readdir(path.join(baseDir, "events"))).toEqual([`${attempt.attemptId}.jsonl`]);
  });

  it("stores and returns events in chronological order", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

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

    const eventArchivePath = path.join(baseDir, "events", "attempt-1.jsonl");
    const persistedEvents = (await readFile(eventArchivePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as AttemptEvent);

    expect(persistedEvents).toEqual([firstEvent, secondEvent]);
    expect(store.getEvents("attempt-1")).toEqual([firstEvent, secondEvent]);

    const restartedStore = await createStore(baseDir);
    expect(restartedStore.getEvents("attempt-1")).toEqual([firstEvent, secondEvent]);
  });

  it("indexes attempts by issue, rebuilds that index from archives, and guards against duplicate attempt ids", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const firstAttempt = createAttempt({
      attemptId: "attempt-1",
      startedAt: "2026-03-16T10:00:00.000Z",
    });
    const secondAttempt = createAttempt({
      attemptId: "attempt-2",
      attemptNumber: 2,
      startedAt: "2026-03-16T10:00:00.000Z",
    });

    await store.createAttempt(firstAttempt);
    await store.createAttempt(secondAttempt);
    await store.createAttempt(secondAttempt);

    expect(store.getAttemptsForIssue("MT-42").map((attempt) => attempt.attemptId)).toEqual(["attempt-2", "attempt-1"]);

    const issueIndexPath = path.join(baseDir, "issue-index.json");
    expect(JSON.parse(await readFile(issueIndexPath, "utf8"))).toEqual({
      "MT-42": ["attempt-2", "attempt-1"],
    });

    expect((await readdir(baseDir)).sort()).toEqual(["attempts", "events", "issue-index.json"]);

    await rm(issueIndexPath, { force: true });

    const restartedStore = await createStore(baseDir);
    expect(restartedStore.getAttemptsForIssue("MT-42").map((attempt) => attempt.attemptId)).toEqual([
      "attempt-2",
      "attempt-1",
    ]);
    expect(JSON.parse(await readFile(issueIndexPath, "utf8"))).toEqual({
      "MT-42": ["attempt-2", "attempt-1"],
    });
  });

  it("updates archived attempts and reindexes issue retrieval when the issue identifier changes", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const attempt = createAttempt();
    await store.createAttempt(attempt);

    await store.updateAttempt(attempt.attemptId, {
      issueIdentifier: "MT-99",
      status: "failed",
      endedAt: "2026-03-16T10:05:00.000Z",
      errorCode: "turn_failed",
      errorMessage: "boom",
    });

    expect(store.getAttemptsForIssue("MT-42")).toEqual([]);
    expect(store.getAttemptsForIssue("MT-99")).toEqual([
      expect.objectContaining({
        attemptId: attempt.attemptId,
        issueIdentifier: "MT-99",
        status: "failed",
        endedAt: "2026-03-16T10:05:00.000Z",
        errorCode: "turn_failed",
        errorMessage: "boom",
      }),
    ]);

    const persistedAttempt = JSON.parse(
      await readFile(path.join(baseDir, "attempts", `${attempt.attemptId}.json`), "utf8"),
    );
    expect(persistedAttempt).toMatchObject({
      attemptId: attempt.attemptId,
      issueIdentifier: "MT-99",
      status: "failed",
      endedAt: "2026-03-16T10:05:00.000Z",
      errorCode: "turn_failed",
      errorMessage: "boom",
    });

    const issueIndex = JSON.parse(await readFile(path.join(baseDir, "issue-index.json"), "utf8")) as Record<
      string,
      string[]
    >;
    expect(issueIndex).toEqual({
      "MT-42": [],
      "MT-99": [attempt.attemptId],
    });

    const restartedStore = await createStore(baseDir);
    expect(restartedStore.getAttemptsForIssue("MT-42")).toEqual([]);
    expect(restartedStore.getAttemptsForIssue("MT-99")).toEqual([
      expect.objectContaining({
        attemptId: attempt.attemptId,
        issueIdentifier: "MT-99",
      }),
    ]);
  });

  it("sumArchivedSeconds returns 0 for an empty store", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    expect(store.sumArchivedSeconds()).toBe(0);
  });

  it("sumArchivedSeconds sums completed attempts and ignores incomplete ones", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const first = createAttempt({
      attemptId: "attempt-1",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:03:00.000Z",
      status: "completed",
    });
    const second = createAttempt({
      attemptId: "attempt-2",
      startedAt: "2026-03-16T11:00:00.000Z",
      endedAt: "2026-03-16T11:01:00.000Z",
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

    // 3*60 + 1*60 = 240 seconds
    expect(store.sumArchivedSeconds()).toBe(240);
  });

  it("sumArchivedSeconds ignores attempts with invalid date ranges", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const invalid = createAttempt({
      attemptId: "attempt-1",
      startedAt: "2026-03-16T10:05:00.000Z",
      endedAt: "2026-03-16T10:00:00.000Z",
      status: "completed",
    });

    await store.createAttempt(invalid);

    expect(store.sumArchivedSeconds()).toBe(0);
  });

  it("migrates legacy newest-first event archives to chronological storage on startup", async () => {
    const baseDir = await createTempDir();
    const attemptsDir = path.join(baseDir, "attempts");
    const eventsDir = path.join(baseDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const attempt = createAttempt({
      status: "completed",
      endedAt: "2026-03-16T10:02:00.000Z",
      turnCount: 2,
    });
    const olderEvent = createEvent({
      at: "2026-03-16T10:01:00.000Z",
      event: "attempt.started",
      message: "started",
    });
    const newerEvent = createEvent({
      at: "2026-03-16T10:02:00.000Z",
      event: "attempt.completed",
      message: "completed",
    });

    await writeFile(
      path.join(attemptsDir, `${attempt.attemptId}.json`),
      `${JSON.stringify(attempt, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(eventsDir, `${attempt.attemptId}.jsonl`),
      `${JSON.stringify(newerEvent)}\n${JSON.stringify(olderEvent)}\n`,
      "utf8",
    );

    const store = await createStore(baseDir);

    expect(store.getEvents(attempt.attemptId)).toEqual([olderEvent, newerEvent]);

    await waitFor(async () => {
      const migratedEvents = (await readFile(path.join(eventsDir, `${attempt.attemptId}.jsonl`), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as AttemptEvent);

      expect(migratedEvents).toEqual([olderEvent, newerEvent]);
    });
  });
});
