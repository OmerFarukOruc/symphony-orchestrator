import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AttemptStore } from "../../src/core/attempt-store.js";
import { createLogger } from "../../src/core/logger.js";
import type { AttemptEvent, AttemptRecord } from "../../src/core/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-attempt-store-test-"));
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
    workspacePath: "/tmp/risoluto/MT-42",
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
      startedAt: "2026-03-16T10:05:00.000Z",
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

  it("reindexAttempt removes only the moved attemptId from the previous issue list", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const first = createAttempt({
      attemptId: "attempt-1",
      issueIdentifier: "MT-42",
      startedAt: "2026-03-16T10:00:00.000Z",
    });
    const second = createAttempt({
      attemptId: "attempt-2",
      issueIdentifier: "MT-42",
      attemptNumber: 2,
      startedAt: "2026-03-16T10:05:00.000Z",
    });

    await store.createAttempt(first);
    await store.createAttempt(second);

    // Both should be under MT-42
    expect(store.getAttemptsForIssue("MT-42").map((a) => a.attemptId)).toEqual(["attempt-2", "attempt-1"]);

    // Move only attempt-1 to a different issue
    await store.updateAttempt("attempt-1", { issueIdentifier: "MT-99" });

    // attempt-2 must still be under MT-42 (filter must not remove all items)
    const remaining = store.getAttemptsForIssue("MT-42").map((a) => a.attemptId);
    expect(remaining).toEqual(["attempt-2"]);

    // attempt-1 must be under MT-99
    expect(store.getAttemptsForIssue("MT-99").map((a) => a.attemptId)).toEqual(["attempt-1"]);
  });

  it("issue-index.json ends with a trailing newline", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.createAttempt(createAttempt());

    const raw = await readFile(path.join(baseDir, "issue-index.json"), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    // Verify it is not just empty — contains valid JSON followed by newline
    expect(raw.length).toBeGreaterThan(1);
    expect(raw.at(-2)).not.toBe("\n"); // Only one trailing newline, not two
  });

  it("resetAggregates zeroes all counters when start() is called on a populated store", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const attempt = createAttempt({
      attemptId: "attempt-1",
      model: "gpt-5.4",
      status: "completed",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:05:00.000Z",
      tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });

    await store.createAttempt(attempt);

    // Confirm aggregates are non-zero before restart
    expect(store.sumArchivedSeconds()).toBeGreaterThan(0);
    expect(store.sumCostUsd()).toBeGreaterThan(0);
    expect(store.sumArchivedTokens().inputTokens).toBeGreaterThan(0);

    // Restart — internally calls resetAggregates then reloads from disk
    await store.start();

    // After restart the aggregates should be reconstructed from disk (not accumulated twice)
    // This verifies resetAggregates actually zeros the fields before reload
    expect(store.sumArchivedSeconds()).toBe(300); // 5 minutes
    expect(store.sumArchivedTokens()).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
    });
  });

  it("sumArchivedTokens accumulates token counts correctly with +=", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const first = createAttempt({
      attemptId: "attempt-1",
      model: "gpt-5.4",
      status: "completed",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:01:00.000Z",
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    });
    const second = createAttempt({
      attemptId: "attempt-2",
      model: "gpt-4o",
      status: "completed",
      startedAt: "2026-03-16T11:00:00.000Z",
      endedAt: "2026-03-16T11:01:00.000Z",
      tokenUsage: { inputTokens: 400, outputTokens: 600, totalTokens: 1000 },
    });

    await store.createAttempt(first);
    await store.createAttempt(second);

    const tokens = store.sumArchivedTokens();
    // Verifies += (not -=): 100 + 400 = 500, not 100 - 400 = -300
    expect(tokens.inputTokens).toBe(500);
    // Verifies += (not -=): 200 + 600 = 800, not 200 - 600 = -400
    expect(tokens.outputTokens).toBe(800);
    // Verifies += (not -=): 300 + 1000 = 1300, not 300 - 1000 = -700
    expect(tokens.totalTokens).toBe(1300);
  });

  it("applyAttemptAggregates uses multiplication for cost (direction * cost)", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    // gpt-5.4: inputUsd=3.0, outputUsd=12.0 per 1M tokens
    // cost = (500 * 3.0 + 250 * 12.0) / 1_000_000 = 0.0045
    const attempt = createAttempt({
      attemptId: "attempt-1",
      model: "gpt-5.4",
      status: "completed",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:01:00.000Z",
      tokenUsage: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
    });

    await store.createAttempt(attempt);

    // direction * cost = 1 * 0.0045 = 0.0045 (not 1 / 0.0045)
    expect(store.sumCostUsd()).toBeCloseTo(0.0045, 10);
  });

  it("updateAttempt reverses old aggregates and applies new ones correctly", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const attempt = createAttempt({
      attemptId: "attempt-1",
      model: "gpt-5.4",
      status: "running",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: null,
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    await store.createAttempt(attempt);

    const tokensBefore = store.sumArchivedTokens();
    expect(tokensBefore.inputTokens).toBe(100);

    // Update with new token usage — should subtract old and add new
    await store.updateAttempt("attempt-1", {
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
      tokenUsage: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
    });

    const tokensAfter = store.sumArchivedTokens();
    // New values (not old + new): old subtracted via direction=-1, new added via direction=1
    expect(tokensAfter.inputTokens).toBe(500);
    expect(tokensAfter.outputTokens).toBe(300);
    expect(tokensAfter.totalTokens).toBe(800);
    expect(store.sumArchivedSeconds()).toBe(300); // 5 minutes
  });

  it("sumArchivedTokens returns a defensive copy", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    await store.createAttempt(
      createAttempt({
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    );

    const tokens = store.sumArchivedTokens();
    tokens.inputTokens = 999;

    // Mutating the returned object must not affect the store's internal state
    expect(store.sumArchivedTokens().inputTokens).toBe(100);
  });

  it("applyAttemptAggregates uses direction * duration for seconds", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);

    const attempt = createAttempt({
      attemptId: "attempt-1",
      startedAt: "2026-03-16T10:00:00.000Z",
      endedAt: "2026-03-16T10:02:00.000Z", // 120 seconds
      status: "completed",
      tokenUsage: null,
    });

    await store.createAttempt(attempt);

    // Verify direction * sumAttemptDurationSeconds uses * not /
    expect(store.sumArchivedSeconds()).toBe(120);
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
