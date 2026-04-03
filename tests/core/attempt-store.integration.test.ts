import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AttemptStore } from "../../src/core/attempt-store.js";
import type { AttemptEvent, AttemptRecord } from "../../src/core/types.js";
import { createMockLogger } from "../helpers.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-attempt-store-int-"));
  tempDirs.push(dir);
  return dir;
}

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Exercise backend integration coverage",
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
    usage: null,
    metadata: null,
    ...overrides,
  };
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

describe("AttemptStore integration", () => {
  it("persists attempts and events to disk, rebuilds indexes on restart, and recomputes aggregates", async () => {
    const baseDir = await createTempDir();
    const logger = createMockLogger();
    const store = new AttemptStore(baseDir, logger);
    await store.start();

    const firstAttempt = createAttempt({
      attemptId: "attempt-1",
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
      tokenUsage: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
    });
    const secondAttempt = createAttempt({
      attemptId: "attempt-2",
      issueId: "issue-2",
      attemptNumber: 2,
      startedAt: "2026-03-16T10:30:00.000Z",
      issueIdentifier: "MT-42",
      status: "running",
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });

    await store.createAttempt(firstAttempt);
    await store.createAttempt(secondAttempt);
    await store.appendEvent(
      createEvent({
        attemptId: "attempt-1",
        event: "attempt.started",
        message: "started",
        at: "2026-03-16T10:01:00.000Z",
      }),
    );
    await store.appendEvent(
      createEvent({
        attemptId: "attempt-1",
        event: "attempt.completed",
        message: "completed",
        at: "2026-03-16T10:05:00.000Z",
      }),
    );

    await store.updateAttempt("attempt-2", {
      issueIdentifier: "MT-99",
      status: "failed",
      endedAt: "2026-03-16T10:45:00.000Z",
      errorCode: "turn_failed",
      errorMessage: "boom",
      tokenUsage: { inputTokens: 800, outputTokens: 200, totalTokens: 1000 },
    });

    expect(store.getAttemptsForIssue("MT-42").map((attempt) => attempt.attemptId)).toEqual(["attempt-1"]);
    expect(store.getAttemptsForIssue("MT-99").map((attempt) => attempt.attemptId)).toEqual(["attempt-2"]);
    expect(store.getEvents("attempt-1").map((event) => event.event)).toEqual(["attempt.started", "attempt.completed"]);
    expect(store.sumArchivedSeconds()).toBe(1200);
    expect(store.sumArchivedTokens()).toEqual({
      inputTokens: 1300,
      outputTokens: 450,
      totalTokens: 1750,
    });
    expect(store.sumCostUsd()).toBeGreaterThan(0);

    const restartedStore = new AttemptStore(baseDir, logger);
    await restartedStore.start();

    expect(restartedStore.getAttempt("attempt-2")).toMatchObject({
      issueIdentifier: "MT-99",
      status: "failed",
      errorCode: "turn_failed",
    });
    expect(restartedStore.getAttemptsForIssue("MT-42").map((attempt) => attempt.attemptId)).toEqual(["attempt-1"]);
    expect(restartedStore.getAttemptsForIssue("MT-99").map((attempt) => attempt.attemptId)).toEqual(["attempt-2"]);
    expect(restartedStore.getEvents("attempt-1").map((event) => event.event)).toEqual([
      "attempt.started",
      "attempt.completed",
    ]);
    expect(restartedStore.sumArchivedSeconds()).toBe(1200);
    expect(restartedStore.sumArchivedTokens()).toEqual({
      inputTokens: 1300,
      outputTokens: 450,
      totalTokens: 1750,
    });

    const issueIndex = JSON.parse(await readFile(path.join(baseDir, "issue-index.json"), "utf8")) as Record<
      string,
      string[]
    >;
    expect(issueIndex).toEqual({
      "MT-42": ["attempt-1"],
      "MT-99": ["attempt-2"],
    });
  });

  it("skips corrupt archives, treats malformed event logs as empty, and migrates legacy newest-first event order", async () => {
    const baseDir = await createTempDir();
    const attemptsDir = path.join(baseDir, "attempts");
    const eventsDir = path.join(baseDir, "events");
    await mkdir(attemptsDir, { recursive: true });
    await mkdir(eventsDir, { recursive: true });

    const validAttempt = createAttempt({
      attemptId: "attempt-good",
      status: "completed",
      endedAt: "2026-03-16T10:02:00.000Z",
      turnCount: 2,
    });
    const malformedEventsAttempt = createAttempt({
      attemptId: "attempt-bad-events",
      issueId: "issue-2",
      startedAt: "2026-03-16T11:00:00.000Z",
      issueIdentifier: "MT-84",
    });
    const olderEvent = createEvent({
      attemptId: "attempt-good",
      at: "2026-03-16T10:01:00.000Z",
      event: "attempt.started",
      message: "started",
    });
    const newerEvent = createEvent({
      attemptId: "attempt-good",
      at: "2026-03-16T10:02:00.000Z",
      event: "attempt.completed",
      message: "completed",
    });

    await writeFile(path.join(attemptsDir, "attempt-good.json"), `${JSON.stringify(validAttempt, null, 2)}\n`, "utf8");
    await writeFile(
      path.join(attemptsDir, "attempt-bad-events.json"),
      `${JSON.stringify(malformedEventsAttempt, null, 2)}\n`,
      "utf8",
    );
    await writeFile(path.join(attemptsDir, "attempt-corrupt.json"), "{not-json", "utf8");
    await writeFile(
      path.join(eventsDir, "attempt-good.jsonl"),
      `${JSON.stringify(newerEvent)}\n${JSON.stringify(olderEvent)}\n`,
      "utf8",
    );
    await writeFile(path.join(eventsDir, "attempt-bad-events.jsonl"), '{"broken":true\n', "utf8");

    const logger = createMockLogger();
    const store = new AttemptStore(baseDir, logger);
    await store.start();

    expect(store.getAttempt("attempt-good")).toMatchObject({
      attemptId: "attempt-good",
      status: "completed",
    });
    expect(store.getAttempt("attempt-corrupt")).toBeNull();
    expect(store.getEvents("attempt-bad-events")).toEqual([]);
    expect(store.getEvents("attempt-good")).toEqual([olderEvent, newerEvent]);
    expect(store.getAttemptsForIssue("MT-42").map((attempt) => attempt.attemptId)).toEqual(["attempt-good"]);
    expect(store.getAttemptsForIssue("MT-84").map((attempt) => attempt.attemptId)).toEqual(["attempt-bad-events"]);

    await waitFor(async () => {
      const migrated = (await readFile(path.join(eventsDir, "attempt-good.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as AttemptEvent);
      expect(migrated).toEqual([olderEvent, newerEvent]);
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entry: "attempt-corrupt.json" }),
      "attempt archive entry could not be loaded",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: "attempt-bad-events" }),
      "attempt event archive corrupt or unreadable",
    );
  });

  it("throws a descriptive error when updating an unknown attempt", async () => {
    const baseDir = await createTempDir();
    const store = new AttemptStore(baseDir, createMockLogger());
    await store.start();

    await expect(store.updateAttempt("missing-attempt", { status: "failed" })).rejects.toThrow(
      "unknown attempt id: missing-attempt",
    );
  });
});
