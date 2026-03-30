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

  it("sumCostUsd returns 0 for an empty store", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    expect(store.sumCostUsd()).toBe(0);
  });

  it("sumCostUsd sums cost for two completed attempts with known models", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    // gpt-5.4: inputUsd=3.0, outputUsd=12.0 per 1M tokens
    // 1000 input + 500 output => (1000*3 + 500*12) / 1_000_000 = 0.009
    const first = createAttempt({
      attemptId: "attempt-1",
      model: "gpt-5.4",
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
      tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });
    // gpt-4o: inputUsd=2.5, outputUsd=10.0 per 1M tokens
    // 2000 input + 1000 output => (2000*2.5 + 1000*10) / 1_000_000 = 0.015
    const second = createAttempt({
      attemptId: "attempt-2",
      model: "gpt-4o",
      status: "completed",
      endedAt: "2026-03-16T11:01:00.000Z",
      tokenUsage: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000 },
    });

    await store.createAttempt(first);
    await store.createAttempt(second);

    // 0.009 + 0.015 = 0.024
    expect(store.sumCostUsd()).toBeCloseTo(0.024, 10);
  });

  it("sumCostUsd ignores attempts with unknown models (contributes 0)", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const attempt = createAttempt({
      attemptId: "attempt-1",
      model: "unknown-model-xyz",
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
      tokenUsage: { inputTokens: 10000, outputTokens: 5000, totalTokens: 15000 },
    });

    await store.createAttempt(attempt);

    expect(store.sumCostUsd()).toBe(0);
  });

  it("sumCostUsd ignores attempts with null tokenUsage (contributes 0)", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const attempt = createAttempt({
      attemptId: "attempt-1",
      model: "gpt-5.4",
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
      tokenUsage: null,
    });

    await store.createAttempt(attempt);

    expect(store.sumCostUsd()).toBe(0);
  });

  it("throws when updating a non-existent attempt", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await expect(store.updateAttempt("does-not-exist", { status: "failed" })).rejects.toThrow("unknown attempt id");
  });

  it("getAllAttempts returns all stored attempts", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.createAttempt(createAttempt({ attemptId: "a1" }));
    await store.createAttempt(createAttempt({ attemptId: "a2", issueIdentifier: "MT-99" }));

    const all = store.getAllAttempts();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.attemptId).sort()).toEqual(["a1", "a2"]);
  });

  it("getEvents returns empty array for unknown attemptId", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    expect(store.getEvents("nonexistent")).toEqual([]);
  });

  it("getAttempt returns null for unknown attemptId", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    expect(store.getAttempt("nonexistent")).toBeNull();
  });

  it("getAttemptsForIssue returns empty array for unknown issue", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    expect(store.getAttemptsForIssue("UNKNOWN-1")).toEqual([]);
  });

  it("sumArchivedTokens returns zeroes for an empty store", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    expect(store.sumArchivedTokens()).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });

  it("sumArchivedTokens sums token usage across attempts", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.createAttempt(
      createAttempt({
        attemptId: "a1",
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    );
    await store.createAttempt(
      createAttempt({
        attemptId: "a2",
        tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      }),
    );

    const tokens = store.sumArchivedTokens();
    expect(tokens.inputTokens).toBe(300);
    expect(tokens.outputTokens).toBe(150);
    expect(tokens.totalTokens).toBe(450);
  });

  it("sumArchivedTokens returns a defensive copy", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const first = store.sumArchivedTokens();
    first.inputTokens = 999;
    expect(store.sumArchivedTokens().inputTokens).toBe(0);
  });

  it("updateAttempt adjusts aggregates when same issue identifier", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const attempt = createAttempt({
      attemptId: "a1",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: null,
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    await store.createAttempt(attempt);

    // Update with endedAt — seconds should now count
    await store.updateAttempt("a1", {
      endedAt: "2026-03-16T10:01:00.000Z",
      tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
    });

    expect(store.sumArchivedSeconds()).toBe(60);
    expect(store.sumArchivedTokens().inputTokens).toBe(200);
  });

  it("createAttempt with duplicate id subtracts old aggregates", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.createAttempt(
      createAttempt({
        attemptId: "a1",
        startedAt: "2026-03-16T10:00:00.000Z",
        endedAt: "2026-03-16T10:01:00.000Z",
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    );
    expect(store.sumArchivedSeconds()).toBe(60);

    // Re-create same attemptId — old aggregates should be subtracted first
    await store.createAttempt(
      createAttempt({
        attemptId: "a1",
        startedAt: "2026-03-16T10:00:00.000Z",
        endedAt: "2026-03-16T10:02:00.000Z",
        tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      }),
    );
    expect(store.sumArchivedSeconds()).toBe(120);
    expect(store.sumArchivedTokens().inputTokens).toBe(200);
  });

  it("appendEvent stores events for attempt not previously seen in eventsByAttempt", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    // Create the attempt to generate the events file
    await store.createAttempt(createAttempt({ attemptId: "a1" }));

    const event = createEvent({ attemptId: "a1", event: "turn.started", message: "started" });
    await store.appendEvent(event);

    expect(store.getEvents("a1")).toEqual([event]);
  });

  it("loadAttemptEvents returns empty array for ENOENT errors", async () => {
    const baseDir = await createTempDir();
    // Write an attempt file but no events file
    await mkdir(path.join(baseDir, "attempts"), { recursive: true });
    await mkdir(path.join(baseDir, "events"), { recursive: true });
    await writeFile(
      path.join(baseDir, "attempts", "orphan.json"),
      JSON.stringify(createAttempt({ attemptId: "orphan" })),
      "utf8",
    );
    // Do NOT create events/orphan.jsonl

    const store = await createStore(baseDir);
    expect(store.getEvents("orphan")).toEqual([]);
  });

  it("loadAttemptFromDisk warns on corrupt archive entries", async () => {
    const baseDir = await createTempDir();
    await mkdir(path.join(baseDir, "attempts"), { recursive: true });
    await mkdir(path.join(baseDir, "events"), { recursive: true });
    await writeFile(path.join(baseDir, "attempts", "bad.json"), "NOT VALID JSON", "utf8");

    const logger = createLogger();
    const store = new AttemptStore(baseDir, logger);
    await store.start();

    // Should not throw, and the bad entry should be skipped
    expect(store.getAttempt("bad")).toBeNull();
  });

  it("does not migrate event order when events are already chronological", async () => {
    const baseDir = await createTempDir();
    const attemptsDir = path.join(baseDir, "attempts");
    const eventsDir = path.join(baseDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const attempt = createAttempt({
      status: "completed",
      endedAt: "2026-03-16T10:02:00.000Z",
    });
    const olderEvent = createEvent({ at: "2026-03-16T10:01:00.000Z" });
    const newerEvent = createEvent({ at: "2026-03-16T10:02:00.000Z" });

    await writeFile(
      path.join(attemptsDir, `${attempt.attemptId}.json`),
      JSON.stringify(attempt, null, 2) + "\n",
      "utf8",
    );
    // Already in chronological order
    await writeFile(
      path.join(eventsDir, `${attempt.attemptId}.jsonl`),
      JSON.stringify(olderEvent) + "\n" + JSON.stringify(newerEvent) + "\n",
      "utf8",
    );

    const store = await createStore(baseDir);
    expect(store.getEvents(attempt.attemptId)).toEqual([olderEvent, newerEvent]);
  });

  it("does not migrate when only one event exists", async () => {
    const baseDir = await createTempDir();
    const attemptsDir = path.join(baseDir, "attempts");
    const eventsDir = path.join(baseDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const attempt = createAttempt({
      status: "completed",
      endedAt: "2026-03-16T10:02:00.000Z",
    });
    const singleEvent = createEvent({ at: "2026-03-16T10:01:00.000Z" });

    await writeFile(
      path.join(attemptsDir, `${attempt.attemptId}.json`),
      JSON.stringify(attempt, null, 2) + "\n",
      "utf8",
    );
    await writeFile(path.join(eventsDir, `${attempt.attemptId}.jsonl`), JSON.stringify(singleEvent) + "\n", "utf8");

    const store = await createStore(baseDir);
    expect(store.getEvents(attempt.attemptId)).toEqual([singleEvent]);
  });

  it("getAttemptsForIssue sorts by startedAt descending", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.createAttempt(createAttempt({ attemptId: "a-old", startedAt: "2026-03-16T09:00:00.000Z" }));
    await store.createAttempt(
      createAttempt({ attemptId: "a-new", startedAt: "2026-03-16T11:00:00.000Z", attemptNumber: 2 }),
    );

    const forIssue = store.getAttemptsForIssue("MT-42");
    expect(forIssue[0].attemptId).toBe("a-new");
    expect(forIssue[1].attemptId).toBe("a-old");
  });

  it("getEvents returns a defensive copy", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.createAttempt(createAttempt());
    await store.appendEvent(createEvent());

    const events = store.getEvents("attempt-1");
    events.push(createEvent({ event: "injected" }));
    // Original should be unaffected
    expect(store.getEvents("attempt-1")).toHaveLength(1);
  });

  it("skips non-json files when loading from disk", async () => {
    const baseDir = await createTempDir();
    await mkdir(path.join(baseDir, "attempts"), { recursive: true });
    await mkdir(path.join(baseDir, "events"), { recursive: true });

    // Write a valid attempt
    const attempt = createAttempt();
    await writeFile(
      path.join(baseDir, "attempts", `${attempt.attemptId}.json`),
      JSON.stringify(attempt, null, 2) + "\n",
      "utf8",
    );
    await writeFile(path.join(baseDir, "events", `${attempt.attemptId}.jsonl`), "", "utf8");

    // Write a non-.json file that should be skipped
    await writeFile(path.join(baseDir, "attempts", "readme.txt"), "not an attempt", "utf8");

    const store = await createStore(baseDir);
    expect(store.getAllAttempts()).toHaveLength(1);
    expect(store.getAttempt(attempt.attemptId)).toEqual(attempt);
  });

  it("skips directory entries (non-files) when loading from disk", async () => {
    const baseDir = await createTempDir();
    await mkdir(path.join(baseDir, "attempts"), { recursive: true });
    await mkdir(path.join(baseDir, "events"), { recursive: true });

    // Create a subdirectory inside attempts/
    await mkdir(path.join(baseDir, "attempts", "subdir.json"), { recursive: true });

    const store = await createStore(baseDir);
    expect(store.getAllAttempts()).toHaveLength(0);
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
