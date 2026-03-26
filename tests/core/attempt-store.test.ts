import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AttemptStore } from "../../src/core/attempt-store.js";
import { createLogger } from "../../src/core/logger.js";
import { closeDatabaseConnection } from "../../src/db/connection.js";
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
    title: "SQLite-backed attempt store",
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
    at: "2026-03-16T10:01:00.000Z",
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

afterEach(async () => {
  for (const dir of tempDirs) {
    closeDatabaseConnection({ baseDir: dir });
  }
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("AttemptStore", () => {
  it("exports the sqlite-backed attempt store implementation", async () => {
    const baseDir = await createTempDir();
    const store = await createStore(baseDir);
    const attempt = createAttempt();
    const event = createEvent();

    await store.createAttempt(attempt);
    await store.appendEvent(event);
    await store.updateAttempt(attempt.attemptId, {
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
    });

    expect(store.getAttempt(attempt.attemptId)).toEqual({
      ...attempt,
      status: "completed",
      endedAt: "2026-03-16T10:05:00.000Z",
    });
    expect(store.getEvents(attempt.attemptId)).toEqual([
      {
        ...event,
        metadata: null,
        usage: null,
        rateLimits: null,
      },
    ]);
    expect(store.getAttemptsForIssue(attempt.issueIdentifier)).toEqual([
      expect.objectContaining({ attemptId: attempt.attemptId, status: "completed" }),
    ]);
    expect(path.join(baseDir, "symphony.db")).toContain("symphony.db");
  });
});
