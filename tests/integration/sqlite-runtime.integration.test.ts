/**
 * Integration tests for SQLite persistence runtime.
 *
 * Exercises bootstrap idempotence, WAL behavior, restart persistence,
 * concurrent access, and error paths against real temp-file databases.
 * No `:memory:` usage — these tests validate the on-disk lifecycle.
 */

import { mkdtemp, rm, chmod, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { attempts, attemptEvents, config, webhookInbox } from "../../src/persistence/sqlite/schema.js";

/** Track all temp dirs for cleanup. */
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-rt-integ-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tempDirs.length = 0;
});

// ---------------------------------------------------------------------------
// Helper: access the raw better-sqlite3 handle from a Drizzle instance
// ---------------------------------------------------------------------------
function getRawClient(db: RisolutoDatabase): InstanceType<typeof BetterSqlite3> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any).session.client;
}

// ---------------------------------------------------------------------------
// Fresh DB bootstrap
// ---------------------------------------------------------------------------
describe("fresh database bootstrap", () => {
  it("creates all expected tables on first open", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "fresh.db");
    const db = openDatabase(dbPath);

    try {
      const raw = getRawClient(db);
      const tableNames: string[] = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => row.name);

      expect(tableNames).toContain("attempts");
      expect(tableNames).toContain("attempt_events");
      expect(tableNames).toContain("issue_index");
      expect(tableNames).toContain("config");
      expect(tableNames).toContain("encrypted_secrets");
      expect(tableNames).toContain("prompt_templates");
      expect(tableNames).toContain("config_history");
      expect(tableNames).toContain("issue_config");
      expect(tableNames).toContain("webhook_inbox");
      expect(tableNames).toContain("notifications");
      expect(tableNames).toContain("schema_version");
    } finally {
      closeDatabase(db);
    }
  });

  it("enables WAL journal mode on a file-backed DB", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "wal.db");
    const db = openDatabase(dbPath);

    try {
      const raw = getRawClient(db);
      const journalMode = raw.pragma("journal_mode", { simple: true });
      expect(journalMode).toBe("wal");
    } finally {
      closeDatabase(db);
    }
  });

  it("enables foreign keys", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "fk.db");
    const db = openDatabase(dbPath);

    try {
      const raw = getRawClient(db);
      const fk = raw.pragma("foreign_keys", { simple: true });
      expect(fk).toBe(1);
    } finally {
      closeDatabase(db);
    }
  });

  it("sets synchronous to NORMAL", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "sync.db");
    const db = openDatabase(dbPath);

    try {
      const raw = getRawClient(db);
      // synchronous=1 is NORMAL
      const syncMode = raw.pragma("synchronous", { simple: true });
      expect(syncMode).toBe(1);
    } finally {
      closeDatabase(db);
    }
  });

  it("seeds schema_version to 7", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "version.db");
    const db = openDatabase(dbPath);

    try {
      const raw = getRawClient(db);
      const versionRow = raw.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as {
        version: number;
      };
      expect(versionRow.version).toBe(7);
    } finally {
      closeDatabase(db);
    }
  });
});

// ---------------------------------------------------------------------------
// Bootstrap idempotence
// ---------------------------------------------------------------------------
describe("bootstrap idempotence", () => {
  it("calling openDatabase twice on the same file produces no errors and preserves schema", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "idempotent.db");

    // First open — creates tables
    const db1 = openDatabase(dbPath);
    closeDatabase(db1);

    // Second open — should be idempotent (CREATE TABLE IF NOT EXISTS)
    const db2 = openDatabase(dbPath);
    try {
      const raw = getRawClient(db2);
      const tableCount = raw
        .prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .get() as { cnt: number };
      expect(tableCount.cnt).toBeGreaterThanOrEqual(10);
    } finally {
      closeDatabase(db2);
    }
  });

  it("data inserted before re-bootstrap survives the second open", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "data-survives.db");

    const db1 = openDatabase(dbPath);
    db1
      .insert(attempts)
      .values({
        attemptId: "surv-1",
        issueId: "issue-1",
        issueIdentifier: "MT-1",
        title: "Survives bootstrap",
        status: "completed",
        startedAt: "2026-03-20T00:00:00.000Z",
        model: "gpt-5",
        modelSource: "default",
        turnCount: 1,
      })
      .run();
    closeDatabase(db1);

    const db2 = openDatabase(dbPath);
    try {
      const rows = db2.select().from(attempts).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].attemptId).toBe("surv-1");
      expect(rows[0].title).toBe("Survives bootstrap");
    } finally {
      closeDatabase(db2);
    }
  });
});

// ---------------------------------------------------------------------------
// Restart persistence
// ---------------------------------------------------------------------------
describe("restart persistence", () => {
  it("attempt data survives close and reopen", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "restart.db");

    const db1 = openDatabase(dbPath);
    db1
      .insert(attempts)
      .values({
        attemptId: "persist-1",
        issueId: "issue-10",
        issueIdentifier: "MT-10",
        title: "Persist across restart",
        status: "running",
        startedAt: "2026-03-20T10:00:00.000Z",
        model: "claude-opus",
        modelSource: "override",
        turnCount: 3,
      })
      .run();

    // Insert an event linked to this attempt
    db1
      .insert(attemptEvents)
      .values({
        attemptId: "persist-1",
        timestamp: "2026-03-20T10:01:00.000Z",
        type: "attempt.started",
        message: "Agent started processing",
      })
      .run();

    closeDatabase(db1);

    // Reopen and verify
    const db2 = openDatabase(dbPath);
    try {
      const attemptRows = db2.select().from(attempts).all();
      expect(attemptRows).toHaveLength(1);
      expect(attemptRows[0]).toMatchObject({
        attemptId: "persist-1",
        issueIdentifier: "MT-10",
        model: "claude-opus",
        turnCount: 3,
      });

      const eventRows = db2.select().from(attemptEvents).all();
      expect(eventRows).toHaveLength(1);
      expect(eventRows[0]).toMatchObject({
        attemptId: "persist-1",
        type: "attempt.started",
      });
    } finally {
      closeDatabase(db2);
    }
  });

  it("config data survives close and reopen", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "config-restart.db");

    const db1 = openDatabase(dbPath);
    db1
      .insert(config)
      .values({
        key: "tracker",
        value: JSON.stringify({ kind: "linear", projectSlug: "test" }),
        updatedAt: "2026-03-20T10:00:00.000Z",
      })
      .run();
    closeDatabase(db1);

    const db2 = openDatabase(dbPath);
    try {
      const rows = db2.select().from(config).all();
      const trackerRow = rows.find((r) => r.key === "tracker");
      expect(trackerRow).toBeDefined();
      const parsed = JSON.parse(trackerRow!.value);
      expect(parsed.kind).toBe("linear");
      expect(parsed.projectSlug).toBe("test");
    } finally {
      closeDatabase(db2);
    }
  });

  it("webhook inbox data survives close and reopen", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "webhook-restart.db");

    const db1 = openDatabase(dbPath);
    db1
      .insert(webhookInbox)
      .values({
        deliveryId: "delivery-001",
        receivedAt: "2026-03-20T10:00:00.000Z",
        type: "Issue",
        action: "update",
        status: "received",
        attemptCount: 0,
      })
      .run();
    closeDatabase(db1);

    const db2 = openDatabase(dbPath);
    try {
      const rows = db2.select().from(webhookInbox).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].deliveryId).toBe("delivery-001");
      expect(rows[0].status).toBe("received");
    } finally {
      closeDatabase(db2);
    }
  });
});

// ---------------------------------------------------------------------------
// Concurrent access
// ---------------------------------------------------------------------------
describe("concurrent access", () => {
  it("second open on the same DB file works in WAL mode (concurrent readers)", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "concurrent.db");

    const db1 = openDatabase(dbPath);
    db1
      .insert(attempts)
      .values({
        attemptId: "conc-1",
        issueId: "issue-1",
        issueIdentifier: "MT-1",
        title: "Concurrent test",
        status: "running",
        startedAt: "2026-03-20T10:00:00.000Z",
        model: "gpt-5",
        modelSource: "default",
        turnCount: 0,
      })
      .run();

    // Open a second connection while the first is still open
    const db2 = openDatabase(dbPath);

    try {
      // Reader on db2 can see data written by db1
      const rows = db2.select().from(attempts).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].attemptId).toBe("conc-1");
    } finally {
      closeDatabase(db2);
      closeDatabase(db1);
    }
  });

  it("concurrent readers see each other's committed writes", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "concurrent-rw.db");

    const db1 = openDatabase(dbPath);
    const db2 = openDatabase(dbPath);

    try {
      db1
        .insert(attempts)
        .values({
          attemptId: "rw-1",
          issueId: "issue-1",
          issueIdentifier: "MT-1",
          title: "Written by db1",
          status: "running",
          startedAt: "2026-03-20T10:00:00.000Z",
          model: "gpt-5",
          modelSource: "default",
          turnCount: 0,
        })
        .run();

      // db2 should see the row written by db1
      const rows = db2.select().from(attempts).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Written by db1");
    } finally {
      closeDatabase(db2);
      closeDatabase(db1);
    }
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------
describe("error paths", () => {
  it("throws clean error when writing after close", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "write-after-close.db");

    const db = openDatabase(dbPath);
    closeDatabase(db);

    expect(() => {
      db.select().from(attempts).all();
    }).toThrow();
  });

  it("throws meaningful error when opening with invalid path", async () => {
    // Attempt to open a DB inside a non-existent directory
    expect(() => {
      openDatabase("/nonexistent/deeply/nested/directory/risoluto.db");
    }).toThrow();
  });

  it("throws meaningful error for read-only directory", async () => {
    const dir = await createTempDir();
    const readonlyDir = path.join(dir, "readonly");

    // Create the directory, then make it read-only
    const { mkdir } = await import("node:fs/promises");
    await mkdir(readonlyDir, { recursive: true });
    await chmod(readonlyDir, 0o444);

    try {
      expect(() => {
        openDatabase(path.join(readonlyDir, "risoluto.db"));
      }).toThrow();
    } finally {
      // Restore permissions for cleanup
      await chmod(readonlyDir, 0o755);
    }
  });

  it("enforces foreign key constraints on attempt_events", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "fk-enforce.db");
    const db = openDatabase(dbPath);

    try {
      expect(() => {
        db.insert(attemptEvents)
          .values({
            attemptId: "nonexistent-attempt",
            timestamp: "2026-03-20T10:00:00.000Z",
            type: "attempt.started",
            message: "Should fail",
          })
          .run();
      }).toThrow();
    } finally {
      closeDatabase(db);
    }
  });
});

// ---------------------------------------------------------------------------
// WAL file creation
// ---------------------------------------------------------------------------
describe("WAL file behavior", () => {
  it("creates a WAL file alongside the database on disk", async () => {
    const dir = await createTempDir();
    const dbPath = path.join(dir, "wal-check.db");
    const db = openDatabase(dbPath);

    try {
      // Write something to ensure WAL is active
      db.insert(config)
        .values({
          key: "test-wal",
          value: JSON.stringify({ active: true }),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // Check that the WAL file exists
      const walPath = dbPath + "-wal";
      const walStat = await stat(walPath).catch(() => null);
      // WAL file should exist (or have existed and been checkpointed)
      // After write, the WAL file is created
      expect(walStat).not.toBeNull();
    } finally {
      closeDatabase(db);
    }
  });
});
