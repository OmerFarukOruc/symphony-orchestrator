/**
 * Shared persistence runtime — owns the single SQLite connection and
 * constructs all stores that share it. Provides graceful close for
 * shutdown lifecycle.
 *
 * All SQLite-backed stores receive an injected `SymphonyDatabase` rather
 * than opening their own connection, ensuring one DB file, one WAL, and
 * one shutdown path.
 */

import path from "node:path";

import type { SymphonyLogger } from "../../core/types.js";
import type { AttemptStorePort } from "../../core/attempt-store-port.js";
import { AttemptStore } from "../../core/attempt-store.js";
import { closeDatabase, openDatabase, type SymphonyDatabase } from "./database.js";
import { SqliteAttemptStore } from "./attempt-store-sqlite.js";
import { migrateFromJsonl } from "./migrator.js";
import { attempts } from "./schema.js";
import { seedDefaults, importLegacyFiles } from "../../config/legacy-import.js";

export interface PersistenceRuntime {
  /** The shared Drizzle database instance. Null in JSONL mode. */
  db: SymphonyDatabase | null;
  /** Attempt store — backed by SQLite or JSONL depending on mode. */
  attemptStore: AttemptStorePort;
  /** Gracefully close the database connection (WAL checkpoint + release locks). */
  close(): void;
}

export interface PersistenceRuntimeOptions {
  /** Data directory where symphony.db lives. */
  dataDir: string;
  /** Logger for persistence-level diagnostics. */
  logger: SymphonyLogger;
  /** Persistence mode — "sqlite" (default) or "jsonl" (legacy). */
  mode?: string;
}

/**
 * Initialize the shared persistence runtime.
 *
 * Opens the database, runs JSONL migration if needed (idempotent),
 * and constructs the attempt store with the shared connection.
 */
export async function initPersistenceRuntime(options: PersistenceRuntimeOptions): Promise<PersistenceRuntime> {
  const { dataDir, logger, mode = process.env.SYMPHONY_PERSISTENCE ?? "sqlite" } = options;
  const storeLogger = logger.child({ component: "attempt-store" });

  if (mode === "jsonl") {
    // Legacy JSONL mode — no shared DB, attempt store manages its own files.
    const store = new AttemptStore(dataDir, storeLogger);
    await store.start();
    return {
      db: null,
      attemptStore: store,
      close() {
        /* no DB to close in JSONL mode */
      },
    };
  }

  const dbPath = path.join(dataDir, "symphony.db");
  const db = openDatabase(dbPath);
  logger.info({ dbPath }, "shared persistence runtime opened");

  // Run JSONL → SQLite migration if the DB is fresh.
  const existing = db.select().from(attempts).limit(1).all();
  if (existing.length === 0) {
    const result = await migrateFromJsonl(db, dataDir, storeLogger);
    if (result.attemptCount > 0) {
      storeLogger.info(
        { attempts: result.attemptCount, events: result.eventCount },
        "migrated JSONL archives to SQLite",
      );
    }
  }

  // Seed config defaults + import legacy files (idempotent).
  seedDefaults(db);
  await importLegacyFiles(db, dataDir, logger);

  const attemptStore = new SqliteAttemptStore(db, storeLogger);

  return {
    db,
    attemptStore,
    close() {
      closeDatabase(db);
      logger.info("shared persistence runtime closed");
    },
  };
}
