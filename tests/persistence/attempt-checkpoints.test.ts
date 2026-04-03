/**
 * Tests for attempt checkpoint history (U7).
 *
 * Covers appendCheckpoint, ordinal assignment, deduplication, listCheckpoints
 * ordering, and the HTTP GET /api/v1/attempts/:attempt_id/checkpoints endpoint.
 */

import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../../src/core/logger.js";
import type { AttemptCheckpointRecord, AttemptRecord } from "../../src/core/types.js";
import { openDatabase, closeDatabase } from "../../src/persistence/sqlite/database.js";
import { SqliteAttemptStore } from "../../src/persistence/sqlite/attempt-store-sqlite.js";
import type { RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { buildStubOrchestrator, buildSilentLogger } from "../helpers/http-server-harness.js";
import { HttpServer } from "../../src/http/server.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-checkpoint-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-cp-1",
    issueId: "issue-1",
    issueIdentifier: "MT-99",
    title: "Checkpoint test",
    workspaceKey: "MT-99",
    workspacePath: "/tmp/risoluto/MT-99",
    status: "running",
    attemptNumber: 1,
    startedAt: "2026-04-03T10:00:00.000Z",
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
    summary: null,
    ...overrides,
  };
}

function makeCheckpoint(
  overrides: Partial<Omit<AttemptCheckpointRecord, "checkpointId" | "ordinal">> = {},
): Omit<AttemptCheckpointRecord, "checkpointId" | "ordinal"> {
  return {
    attemptId: "attempt-cp-1",
    trigger: "attempt_created",
    eventCursor: null,
    status: "running",
    threadId: null,
    turnId: null,
    turnCount: 0,
    tokenUsage: null,
    metadata: null,
    createdAt: "2026-04-03T10:00:00.000Z",
    ...overrides,
  };
}

function createStore(dir: string): { store: SqliteAttemptStore; db: RisolutoDatabase } {
  const dbPath = path.join(dir, "test.db");
  const db = openDatabase(dbPath);
  const store = new SqliteAttemptStore(db, createLogger());
  return { store, db };
}

/* ------------------------------------------------------------------ */
/*  Unit tests — SQLite store                                          */
/* ------------------------------------------------------------------ */

describe("SqliteAttemptStore — appendCheckpoint / listCheckpoints", () => {
  it("assigns ascending ordinals for consecutive checkpoints", async () => {
    const dir = await createTempDir();
    const { store, db } = createStore(dir);
    await store.createAttempt(createAttempt());

    await store.appendCheckpoint(makeCheckpoint({ trigger: "attempt_created" }));
    await store.appendCheckpoint(makeCheckpoint({ trigger: "cursor_advanced", turnCount: 1 }));
    await store.appendCheckpoint(makeCheckpoint({ trigger: "terminal_completion", status: "completed", turnCount: 2 }));

    const checkpoints = await store.listCheckpoints("attempt-cp-1");
    expect(checkpoints).toHaveLength(3);
    expect(checkpoints[0].ordinal).toBe(1);
    expect(checkpoints[1].ordinal).toBe(2);
    expect(checkpoints[2].ordinal).toBe(3);

    closeDatabase(db);
  });

  it("suppresses duplicate checkpoint when all key fields are identical", async () => {
    const dir = await createTempDir();
    const { store, db } = createStore(dir);
    await store.createAttempt(createAttempt());

    const cp = makeCheckpoint({ trigger: "cursor_advanced", turnCount: 1 });
    await store.appendCheckpoint(cp);
    // Write same checkpoint again — should be a no-op.
    await store.appendCheckpoint(cp);

    const checkpoints = await store.listCheckpoints("attempt-cp-1");
    expect(checkpoints).toHaveLength(1);

    closeDatabase(db);
  });

  it("does NOT suppress when status changes between writes", async () => {
    const dir = await createTempDir();
    const { store, db } = createStore(dir);
    await store.createAttempt(createAttempt());

    await store.appendCheckpoint(makeCheckpoint({ trigger: "status_transition", status: "running" }));
    await store.appendCheckpoint(makeCheckpoint({ trigger: "status_transition", status: "completed" }));

    const checkpoints = await store.listCheckpoints("attempt-cp-1");
    expect(checkpoints).toHaveLength(2);

    closeDatabase(db);
  });

  it("listCheckpoints returns results ordered by ordinal ascending", async () => {
    const dir = await createTempDir();
    const { store, db } = createStore(dir);
    await store.createAttempt(createAttempt());

    await store.appendCheckpoint(makeCheckpoint({ trigger: "attempt_created" }));
    await store.appendCheckpoint(makeCheckpoint({ trigger: "cursor_advanced", turnCount: 1 }));

    const checkpoints = await store.listCheckpoints("attempt-cp-1");
    expect(checkpoints[0].trigger).toBe("attempt_created");
    expect(checkpoints[1].trigger).toBe("cursor_advanced");
    expect(checkpoints[0].ordinal).toBeLessThan(checkpoints[1].ordinal);

    closeDatabase(db);
  });

  it("listCheckpoints returns an empty array for an unknown attemptId", async () => {
    const dir = await createTempDir();
    const { store, db } = createStore(dir);

    const checkpoints = await store.listCheckpoints("nonexistent-attempt-id");
    expect(checkpoints).toEqual([]);

    closeDatabase(db);
  });

  it("persists tokenUsage correctly via mapper round-trip", async () => {
    const dir = await createTempDir();
    const { store, db } = createStore(dir);
    await store.createAttempt(createAttempt());

    const cp = makeCheckpoint({
      trigger: "cursor_advanced",
      turnCount: 1,
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    await store.appendCheckpoint(cp);

    const checkpoints = await store.listCheckpoints("attempt-cp-1");
    expect(checkpoints[0].tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });

    closeDatabase(db);
  });

  it("persists metadata correctly via mapper round-trip", async () => {
    const dir = await createTempDir();
    const { store, db } = createStore(dir);
    await store.createAttempt(createAttempt());

    const cp = makeCheckpoint({
      trigger: "attempt_created",
      metadata: { workspace: "/tmp/test", model: "gpt-5.4" },
    });
    await store.appendCheckpoint(cp);

    const checkpoints = await store.listCheckpoints("attempt-cp-1");
    expect(checkpoints[0].metadata).toEqual({ workspace: "/tmp/test", model: "gpt-5.4" });

    closeDatabase(db);
  });
});

/* ------------------------------------------------------------------ */
/*  HTTP integration tests                                             */
/* ------------------------------------------------------------------ */

describe("GET /api/v1/attempts/:attempt_id/checkpoints", () => {
  let dataDir: string;
  let db: RisolutoDatabase;
  let store: SqliteAttemptStore;
  let server: HttpServer;
  let baseUrl: string;

  beforeEach(async () => {
    dataDir = await createTempDir();
    db = openDatabase(path.join(dataDir, "test.db"));
    store = new SqliteAttemptStore(db, createLogger());

    // Seed one attempt and two checkpoints.
    await store.createAttempt(createAttempt());
    await store.appendCheckpoint(makeCheckpoint({ trigger: "attempt_created" }));
    await store.appendCheckpoint(makeCheckpoint({ trigger: "cursor_advanced", turnCount: 1 }));

    // Build an orchestrator that knows about the attempt.
    const orchestrator = buildStubOrchestrator({
      getAttemptDetail: vi.fn().mockImplementation((id: string) => {
        if (id === "attempt-cp-1") {
          return { attemptId: "attempt-cp-1" };
        }
        return null;
      }),
    });

    server = new HttpServer({
      orchestrator,
      logger: buildSilentLogger(),
      attemptStore: store,
      archiveDir: dataDir,
    });
    const { port } = await server.start(0);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.stop();
    closeDatabase(db);
  });

  it("returns 200 with the checkpoint list for a known attempt", async () => {
    const response = await fetch(`${baseUrl}/api/v1/attempts/attempt-cp-1/checkpoints`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { checkpoints: AttemptCheckpointRecord[] };
    expect(body.checkpoints).toHaveLength(2);
    expect(body.checkpoints[0].trigger).toBe("attempt_created");
    expect(body.checkpoints[1].trigger).toBe("cursor_advanced");
    expect(body.checkpoints[0].ordinal).toBe(1);
    expect(body.checkpoints[1].ordinal).toBe(2);
  });

  it("returns 404 for an unknown attempt identifier", async () => {
    const response = await fetch(`${baseUrl}/api/v1/attempts/nonexistent-id/checkpoints`);
    expect(response.status).toBe(404);

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});
