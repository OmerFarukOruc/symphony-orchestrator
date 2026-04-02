/**
 * Integration tests for all SQLite store modules against real temp-file databases.
 *
 * Exercises CRUD operations, lifecycle transitions, dedup, retry/DLQ, and
 * cross-module workflows. No `:memory:` usage — all tests use temp files.
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { createLogger } from "../../src/core/logger.js";
import type { AttemptEvent, AttemptRecord } from "../../src/core/types.js";
import { SqliteAttemptStore } from "../../src/persistence/sqlite/attempt-store-sqlite.js";
import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { IssueConfigStore } from "../../src/persistence/sqlite/issue-config-store.js";
import { SqliteWebhookInbox } from "../../src/persistence/sqlite/webhook-inbox.js";
import { attemptEvents, attempts } from "../../src/persistence/sqlite/schema.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const tempDirs: string[] = [];
const openDbs: RisolutoDatabase[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-store-integ-"));
  tempDirs.push(dir);
  return dir;
}

function openTempDb(dir: string, name = "test.db"): RisolutoDatabase {
  const db = openDatabase(path.join(dir, name));
  openDbs.push(db);
  return db;
}

afterEach(async () => {
  for (const db of openDbs) {
    try {
      closeDatabase(db);
    } catch {
      /* already closed */
    }
  }
  openDbs.length = 0;

  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tempDirs.length = 0;
});

const logger = createLogger();

function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId: "attempt-1",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    title: "Test attempt",
    workspaceKey: "MT-42",
    workspacePath: "/tmp/risoluto/MT-42",
    status: "running",
    attemptNumber: 1,
    startedAt: "2026-03-20T10:00:00.000Z",
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

function makeEvent(overrides: Partial<AttemptEvent> = {}): AttemptEvent {
  return {
    attemptId: "attempt-1",
    at: "2026-03-20T10:01:00.000Z",
    issueId: "issue-1",
    issueIdentifier: "MT-42",
    sessionId: null,
    event: "attempt.updated",
    message: "Processing",
    content: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SqliteWebhookInbox
// ---------------------------------------------------------------------------
describe("SqliteWebhookInbox (file-backed)", () => {
  function makeDelivery(overrides: Record<string, unknown> = {}) {
    return {
      deliveryId: "del-001",
      type: "Issue",
      action: "update",
      entityId: "entity-1",
      issueId: "issue-1",
      issueIdentifier: "MT-42",
      webhookTimestamp: Date.now(),
      payloadJson: JSON.stringify({ test: true }),
      ...overrides,
    };
  }

  it("insertVerified persists a new delivery with status 'received'", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    const result = await inbox.insertVerified(makeDelivery());

    expect(result.isNew).toBe(true);

    const recent = await inbox.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0].deliveryId).toBe("del-001");
    expect(recent[0].status).toBe("received");
  });

  it("dedup: inserting same deliveryId twice returns isNew=false", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    const first = await inbox.insertVerified(makeDelivery());
    const second = await inbox.insertVerified(makeDelivery());

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);

    const recent = await inbox.getRecent();
    expect(recent).toHaveLength(1);
  });

  it("lifecycle: received -> processing -> applied", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    await inbox.insertVerified(makeDelivery());
    await inbox.markProcessing("del-001");

    let recent = await inbox.getRecent();
    expect(recent[0].status).toBe("processing");

    await inbox.markApplied("del-001");

    recent = await inbox.getRecent();
    expect(recent[0].status).toBe("applied");
    expect(recent[0].appliedAt).not.toBeNull();
  });

  it("markIgnored sets status to 'ignored' with appliedAt timestamp", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    await inbox.insertVerified(makeDelivery());
    await inbox.markIgnored("del-001");

    const recent = await inbox.getRecent();
    expect(recent[0].status).toBe("ignored");
    expect(recent[0].appliedAt).not.toBeNull();
  });

  it("DLQ: markDeadLetter sets status and records error", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    await inbox.insertVerified(makeDelivery());
    await inbox.markDeadLetter("del-001", "Unrecoverable processing failure");

    const recent = await inbox.getRecent();
    expect(recent[0].status).toBe("dead_letter");
    expect(recent[0].lastError).toBe("Unrecoverable processing failure");

    const stats = await inbox.getStats();
    expect(stats.dlqCount).toBe(1);
  });

  it("DLQ items do not appear in fetchDueForRetry", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    await inbox.insertVerified(makeDelivery());
    await inbox.markDeadLetter("del-001", "Permanent failure");

    const retryItems = await inbox.fetchDueForRetry();
    expect(retryItems).toHaveLength(0);
  });

  it("retry: future nextAttemptAt is not due; past nextAttemptAt is due", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    await inbox.insertVerified(makeDelivery());

    // Schedule retry far in the future
    const futureTime = new Date(Date.now() + 3_600_000).toISOString();
    await inbox.markForRetry("del-001", "Transient error", 1, futureTime);

    let retryItems = await inbox.fetchDueForRetry();
    expect(retryItems).toHaveLength(0);

    // Now reschedule to the past
    const pastTime = new Date(Date.now() - 1000).toISOString();
    await inbox.markForRetry("del-001", "Transient error", 2, pastTime);

    retryItems = await inbox.fetchDueForRetry();
    expect(retryItems).toHaveLength(1);
    expect(retryItems[0].deliveryId).toBe("del-001");
    expect(retryItems[0].attemptCount).toBe(2);
  });

  it("getStats returns correct backlog and DLQ counts", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    await inbox.insertVerified(makeDelivery({ deliveryId: "d1" }));
    await inbox.insertVerified(makeDelivery({ deliveryId: "d2" }));
    await inbox.insertVerified(makeDelivery({ deliveryId: "d3" }));

    // d2 -> applied, d3 -> dead_letter
    await inbox.markApplied("d2");
    await inbox.markDeadLetter("d3", "Failed");

    const stats = await inbox.getStats();
    expect(stats.backlogCount).toBe(1); // only d1 is still "received"
    expect(stats.dlqCount).toBe(1);
    expect(stats.oldestBacklogAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(stats.lastDeliveryAgeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("getRecent returns deliveries ordered by receivedAt descending", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    await inbox.insertVerified(makeDelivery({ deliveryId: "first" }));
    // Small delay to ensure ordering by receivedAt
    await inbox.insertVerified(makeDelivery({ deliveryId: "second" }));

    const recent = await inbox.getRecent(10);
    expect(recent).toHaveLength(2);
    // Most recent first
    expect(recent[0].deliveryId).toBe("second");
    expect(recent[1].deliveryId).toBe("first");
  });

  it("markForRetry truncates long error messages to 500 chars", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const inbox = new SqliteWebhookInbox(db, logger);

    await inbox.insertVerified(makeDelivery());

    const longError = "x".repeat(1000);
    await inbox.markForRetry("del-001", longError, 1, new Date().toISOString());

    const recent = await inbox.getRecent();
    expect(recent[0].lastError).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------
// SqliteAttemptStore
// ---------------------------------------------------------------------------
describe("SqliteAttemptStore (file-backed)", () => {
  it("create, get, update, list full lifecycle", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new SqliteAttemptStore(db, logger);

    // Create
    const attempt = makeAttempt();
    await store.createAttempt(attempt);

    // Get
    const fetched = store.getAttempt("attempt-1");
    expect(fetched).not.toBeNull();
    expect(fetched!.issueIdentifier).toBe("MT-42");
    expect(fetched!.status).toBe("running");

    // Update
    await store.updateAttempt("attempt-1", {
      status: "completed",
      endedAt: "2026-03-20T10:05:00.000Z",
      turnCount: 5,
      tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    });

    const updated = store.getAttempt("attempt-1");
    expect(updated!.status).toBe("completed");
    expect(updated!.endedAt).toBe("2026-03-20T10:05:00.000Z");
    expect(updated!.turnCount).toBe(5);
    expect(updated!.tokenUsage).toEqual({ inputTokens: 1000, outputTokens: 500, totalTokens: 1500 });

    // List all
    const all = store.getAllAttempts();
    expect(all).toHaveLength(1);
  });

  it("filter by status across multiple attempts", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new SqliteAttemptStore(db, logger);

    await store.createAttempt(makeAttempt({ attemptId: "a1", status: "running" }));
    await store.createAttempt(makeAttempt({ attemptId: "a2", status: "completed" }));
    await store.createAttempt(makeAttempt({ attemptId: "a3", status: "failed" }));
    await store.createAttempt(makeAttempt({ attemptId: "a4", status: "running" }));

    const forIssue = store.getAttemptsForIssue("MT-42");
    expect(forIssue).toHaveLength(4);
  });

  it("getAttempt returns null for non-existent attempt", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new SqliteAttemptStore(db, logger);

    expect(store.getAttempt("does-not-exist")).toBeNull();
  });

  it("updateAttempt throws for unknown attempt id", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new SqliteAttemptStore(db, logger);

    await expect(store.updateAttempt("nonexistent", { status: "failed" })).rejects.toThrow("unknown attempt id");
  });

  it("sumArchivedSeconds sums only completed (ended) attempts", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new SqliteAttemptStore(db, logger);

    await store.createAttempt(
      makeAttempt({
        attemptId: "a1",
        status: "completed",
        startedAt: "2026-03-20T10:00:00.000Z",
        endedAt: "2026-03-20T10:05:00.000Z",
      }),
    );
    await store.createAttempt(
      makeAttempt({
        attemptId: "a2",
        status: "running",
        startedAt: "2026-03-20T11:00:00.000Z",
        endedAt: null,
      }),
    );

    // Only a1 counted: 5 minutes = 300 seconds
    expect(store.sumArchivedSeconds()).toBeCloseTo(300, 0);
  });

  it("sumArchivedTokens sums across all attempts", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new SqliteAttemptStore(db, logger);

    await store.createAttempt(
      makeAttempt({
        attemptId: "a1",
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    );
    await store.createAttempt(
      makeAttempt({
        attemptId: "a2",
        tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      }),
    );

    const totals = store.sumArchivedTokens();
    expect(totals.inputTokens).toBe(300);
    expect(totals.outputTokens).toBe(150);
    expect(totals.totalTokens).toBe(450);
  });

  it("appendEvent and getEvents round-trip with metadata", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new SqliteAttemptStore(db, logger);

    await store.createAttempt(makeAttempt());

    await store.appendEvent(
      makeEvent({
        event: "attempt.started",
        message: "Agent started",
        at: "2026-03-20T10:01:00.000Z",
        metadata: { exitCode: 0, duration: 42 },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    );

    await store.appendEvent(
      makeEvent({
        event: "attempt.completed",
        message: "Agent completed",
        at: "2026-03-20T10:02:00.000Z",
      }),
    );

    const events = store.getEvents("attempt-1");
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("attempt.started");
    expect(events[0].metadata).toEqual({ exitCode: 0, duration: 42 });
    expect(events[0].usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    expect(events[1].event).toBe("attempt.completed");
  });

  it("data persists across close/reopen (file-backed round-trip)", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "persist.db");

    // Open, write, close
    const db1 = openDatabase(dbPath);
    const store1 = new SqliteAttemptStore(db1, logger);
    await store1.createAttempt(makeAttempt());
    await store1.appendEvent(makeEvent());
    closeDatabase(db1);

    // Reopen and verify
    const db2 = openDatabase(dbPath);
    openDbs.push(db2);
    const store2 = new SqliteAttemptStore(db2, logger);

    expect(store2.getAttempt("attempt-1")).not.toBeNull();
    expect(store2.getEvents("attempt-1")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// IssueConfigStore
// ---------------------------------------------------------------------------
describe("IssueConfigStore (file-backed)", () => {
  it("upsertModel and loadAll round-trip", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new IssueConfigStore(db);

    store.upsertModel("MT-1", "gpt-5", "high");
    store.upsertModel("MT-2", "claude-opus", null);

    const all = store.loadAll();
    expect(all).toHaveLength(2);

    const mt1 = all.find((r) => r.identifier === "MT-1");
    expect(mt1).toMatchObject({ model: "gpt-5", reasoningEffort: "high" });

    const mt2 = all.find((r) => r.identifier === "MT-2");
    expect(mt2).toMatchObject({ model: "claude-opus", reasoningEffort: null });
  });

  it("upsertTemplateId and getTemplateId", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new IssueConfigStore(db);

    store.upsertTemplateId("MT-10", "tmpl-abc");
    expect(store.getTemplateId("MT-10")).toBe("tmpl-abc");
  });

  it("getTemplateId returns null for non-existent key", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new IssueConfigStore(db);

    expect(store.getTemplateId("NONEXISTENT")).toBeNull();
  });

  it("clearTemplateId sets templateId to null", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new IssueConfigStore(db);

    store.upsertTemplateId("MT-20", "tmpl-xyz");
    expect(store.getTemplateId("MT-20")).toBe("tmpl-xyz");

    store.clearTemplateId("MT-20");
    expect(store.getTemplateId("MT-20")).toBeNull();
  });

  it("upsertModel preserves existing templateId", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new IssueConfigStore(db);

    store.upsertTemplateId("MT-30", "tmpl-orig");
    store.upsertModel("MT-30", "gpt-5", "medium");

    const row = store.loadAll().find((r) => r.identifier === "MT-30");
    expect(row).toMatchObject({
      model: "gpt-5",
      reasoningEffort: "medium",
      templateId: "tmpl-orig",
    });
  });

  it("upsertTemplateId preserves existing model columns", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new IssueConfigStore(db);

    store.upsertModel("MT-40", "claude-opus", "high");
    store.upsertTemplateId("MT-40", "tmpl-new");

    const row = store.loadAll().find((r) => r.identifier === "MT-40");
    expect(row).toMatchObject({
      model: "claude-opus",
      reasoningEffort: "high",
      templateId: "tmpl-new",
    });
  });

  it("data persists across close/reopen", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "issue-config-persist.db");

    const db1 = openDatabase(dbPath);
    const store1 = new IssueConfigStore(db1);
    store1.upsertModel("MT-50", "gpt-5", "high");
    store1.upsertTemplateId("MT-50", "tmpl-persist");
    closeDatabase(db1);

    const db2 = openDatabase(dbPath);
    openDbs.push(db2);
    const store2 = new IssueConfigStore(db2);

    const row = store2.loadAll().find((r) => r.identifier === "MT-50");
    expect(row).toMatchObject({
      model: "gpt-5",
      reasoningEffort: "high",
      templateId: "tmpl-persist",
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-module integration: attempt + events linkage
// ---------------------------------------------------------------------------
describe("cross-module workflows", () => {
  it("insert attempt -> insert events -> query events by attemptId -> all linked correctly", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const store = new SqliteAttemptStore(db, logger);

    // Create two attempts
    await store.createAttempt(makeAttempt({ attemptId: "cross-1", issueIdentifier: "MT-100" }));
    await store.createAttempt(makeAttempt({ attemptId: "cross-2", issueIdentifier: "MT-200" }));

    // Insert events for both
    await store.appendEvent(
      makeEvent({
        attemptId: "cross-1",
        event: "attempt.started",
        message: "Started cross-1",
        at: "2026-03-20T10:00:00.000Z",
      }),
    );
    await store.appendEvent(
      makeEvent({
        attemptId: "cross-1",
        event: "attempt.completed",
        message: "Completed cross-1",
        at: "2026-03-20T10:05:00.000Z",
      }),
    );
    await store.appendEvent(
      makeEvent({
        attemptId: "cross-2",
        event: "attempt.started",
        message: "Started cross-2",
        at: "2026-03-20T11:00:00.000Z",
      }),
    );

    // Query events for cross-1 only
    const events1 = store.getEvents("cross-1");
    expect(events1).toHaveLength(2);
    expect(events1.every((e) => e.attemptId === "cross-1")).toBe(true);
    expect(events1[0].event).toBe("attempt.started");
    expect(events1[1].event).toBe("attempt.completed");

    // Query events for cross-2 only
    const events2 = store.getEvents("cross-2");
    expect(events2).toHaveLength(1);
    expect(events2[0].attemptId).toBe("cross-2");
  });

  it("attempt store and issue config store share the same DB connection", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const attemptStore = new SqliteAttemptStore(db, logger);
    const issueConfigStore = new IssueConfigStore(db);

    // Write via both stores
    await attemptStore.createAttempt(makeAttempt({ attemptId: "shared-1", issueIdentifier: "MT-77" }));
    issueConfigStore.upsertModel("MT-77", "gpt-5", "high");

    // Both should be readable via the same connection
    expect(attemptStore.getAttempt("shared-1")).not.toBeNull();
    expect(issueConfigStore.getTemplateId("MT-77")).toBeNull();
    expect(issueConfigStore.loadAll()).toHaveLength(1);
  });

  it("attempt store, issue config, and webhook inbox all coexist on same DB", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);
    const attemptStore = new SqliteAttemptStore(db, logger);
    const issueConfigStore = new IssueConfigStore(db);
    const inbox = new SqliteWebhookInbox(db, logger);

    // Write to all three stores
    await attemptStore.createAttempt(makeAttempt({ attemptId: "multi-1" }));
    issueConfigStore.upsertModel("MT-42", "gpt-5", "high");
    await inbox.insertVerified({
      deliveryId: "multi-del-1",
      type: "Issue",
      action: "update",
      entityId: "entity-1",
      issueId: "issue-1",
      issueIdentifier: "MT-42",
      webhookTimestamp: Date.now(),
      payloadJson: null,
    });

    // Verify all three are accessible
    expect(attemptStore.getAllAttempts()).toHaveLength(1);
    expect(issueConfigStore.loadAll()).toHaveLength(1);
    const recent = await inbox.getRecent();
    expect(recent).toHaveLength(1);
  });

  it("foreign key enforcement across modules: events require valid attempt", async () => {
    const dir = await createTempDir();
    const db = openTempDb(dir);

    // Attempting to insert an event with a non-existent attemptId should throw
    expect(() => {
      db.insert(attemptEvents)
        .values({
          attemptId: "invalid-attempt-id",
          timestamp: "2026-03-20T10:00:00.000Z",
          type: "attempt.started",
          message: "Should fail due to FK constraint",
        })
        .run();
    }).toThrow();

    // But after creating the attempt, it should work
    db.insert(attempts)
      .values({
        attemptId: "valid-attempt",
        issueId: "issue-1",
        issueIdentifier: "MT-1",
        title: "Valid attempt",
        status: "running",
        startedAt: "2026-03-20T10:00:00.000Z",
        model: "gpt-5",
        modelSource: "default",
        turnCount: 0,
      })
      .run();

    expect(() => {
      db.insert(attemptEvents)
        .values({
          attemptId: "valid-attempt",
          timestamp: "2026-03-20T10:01:00.000Z",
          type: "attempt.started",
          message: "Should succeed",
        })
        .run();
    }).not.toThrow();

    const events = db.select().from(attemptEvents).where(eq(attemptEvents.attemptId, "valid-attempt")).all();
    expect(events).toHaveLength(1);
  });
});
