/**
 * Shared persistence runtime — owns the single SQLite connection and
 * constructs all stores that share it. Provides graceful close for
 * shutdown lifecycle.
 *
 * All SQLite-backed stores receive an injected `RisolutoDatabase` rather
 * than opening their own connection, ensuring one DB file, one WAL, and
 * one shutdown path.
 */

import path from "node:path";

import type { RisolutoLogger } from "../../core/types.js";
import type { AttemptStorePort } from "../../core/attempt-store-port.js";
import { closeDatabase, openDatabase, type RisolutoDatabase } from "./database.js";
import { createOperatorPersistence, type OperatorPersistence } from "./operator-persistence.js";
import { createWebhookPersistence, type WebhookPersistence } from "./webhook-persistence.js";
import { SqliteAttemptStore } from "./attempt-store-sqlite.js";
import { eq } from "drizzle-orm";

import { migrateFromJsonl } from "./migrator.js";
import { attempts, config, promptTemplates } from "./schema.js";
import { DEFAULT_CONFIG_SECTIONS, DEFAULT_PROMPT_TEMPLATE } from "../../config/defaults.js";

export interface PersistenceRuntime {
  /** The shared Drizzle database instance. */
  db: RisolutoDatabase;
  /** Attempt store — backed by SQLite. */
  attemptStore: AttemptStorePort;
  /** Operator-facing SQLite stores grouped by domain instead of by table. */
  operator: OperatorPersistence;
  /** Webhook-facing SQLite stores grouped by delivery workflow instead of raw table access. */
  webhook: WebhookPersistence;
  /** Gracefully close the database connection (WAL checkpoint + release locks). */
  close(): void;
}

export interface PersistenceRuntimeOptions {
  /** Data directory where risoluto.db lives. */
  dataDir: string;
  /** Logger for persistence-level diagnostics. */
  logger: RisolutoLogger;
}

/**
 * Seed default config sections and prompt template into the DB if their
 * respective tables are empty. Runs on every boot but is idempotent.
 */
export function seedDefaults(db: RisolutoDatabase): void {
  const now = new Date().toISOString();

  const existing = db.select().from(config).limit(1).all();
  if (existing.length === 0) {
    for (const [key, value] of Object.entries(DEFAULT_CONFIG_SECTIONS)) {
      db.insert(config)
        .values({ key, value: JSON.stringify(value), updatedAt: now })
        .onConflictDoNothing()
        .run();
    }
  }

  // Seed default prompt template independently — runs whenever the table is
  // empty, regardless of whether config rows already exist (e.g. upgraded DBs).
  const existingTemplates = db.select().from(promptTemplates).limit(1).all();
  if (existingTemplates.length === 0) {
    db.insert(promptTemplates)
      .values({
        id: "default",
        name: "Default",
        body: DEFAULT_PROMPT_TEMPLATE,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();

    // Set the selected template in system config
    const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
    if (systemRow) {
      const systemConfig = JSON.parse(systemRow.value) as Record<string, unknown>;
      systemConfig.selectedTemplateId = "default";
      db.update(config)
        .set({ value: JSON.stringify(systemConfig), updatedAt: now })
        .where(eq(config.key, "system"))
        .run();
    }
  }
}

/**
 * Initialize the shared persistence runtime.
 *
 * Opens the database, runs JSONL migration if needed (idempotent),
 * and constructs the attempt store with the shared connection.
 */
export async function initPersistenceRuntime(options: PersistenceRuntimeOptions): Promise<PersistenceRuntime> {
  const { dataDir, logger } = options;
  const storeLogger = logger.child({ component: "attempt-store" });

  const dbPath = path.join(dataDir, "risoluto.db");
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

  // Seed config defaults (idempotent — only populates empty tables).
  seedDefaults(db);

  const attemptStore = new SqliteAttemptStore(db, storeLogger);
  const operator = createOperatorPersistence(db);
  const webhook = createWebhookPersistence(db, logger.child({ component: "webhook" }));

  return {
    db,
    attemptStore,
    operator,
    webhook,
    close() {
      closeDatabase(db);
      logger.info("shared persistence runtime closed");
    },
  };
}
