/**
 * SQLite-backed implementation of the AttemptStore interface.
 *
 * Provides the same public API as the JSONL-based `AttemptStore` but
 * persists data in a SQLite database for queryable, durable storage.
 */

import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { lookupModelPrice } from "../../core/model-pricing.js";
import type { AttemptEvent, AttemptRecord, SymphonyLogger } from "../../core/types.js";
import { closeDatabase, openDatabase, type SymphonyDatabase } from "./database.js";
import { attemptEvents, attempts } from "./schema.js";
import { rowToAttemptRecord, attemptRecordToRow, rowToAttemptEvent, attemptEventToRow } from "./mappers.js";
import { migrateFromJsonl } from "./migrator.js";

export class SqliteAttemptStore {
  private db: SymphonyDatabase | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly logger: SymphonyLogger,
  ) {}

  async start(): Promise<void> {
    this.db = openDatabase(this.dbPath);
    this.logger.info({ dbPath: this.dbPath }, "SQLite attempt store opened");
  }

  getAttempt(attemptId: string): AttemptRecord | null {
    const rows = this.getDb().select().from(attempts).where(eq(attempts.attemptId, attemptId)).all();
    if (rows.length === 0) return null;
    return rowToAttemptRecord(rows[0]);
  }

  getAllAttempts(): AttemptRecord[] {
    const rows = this.getDb().select().from(attempts).all();
    return rows.map(rowToAttemptRecord);
  }

  getEvents(attemptId: string): AttemptEvent[] {
    const rows = this.getDb()
      .select()
      .from(attemptEvents)
      .where(eq(attemptEvents.attemptId, attemptId))
      .orderBy(attemptEvents.timestamp)
      .all();
    return rows.map(rowToAttemptEvent);
  }

  getAttemptsForIssue(issueIdentifier: string): AttemptRecord[] {
    const rows = this.getDb()
      .select()
      .from(attempts)
      .where(eq(attempts.issueIdentifier, issueIdentifier))
      .orderBy(desc(attempts.startedAt))
      .all();
    return rows.map(rowToAttemptRecord);
  }

  async createAttempt(attempt: AttemptRecord): Promise<void> {
    const row = attemptRecordToRow(attempt);
    this.getDb().insert(attempts).values(row).onConflictDoNothing().run();
  }

  async updateAttempt(attemptId: string, patch: Partial<AttemptRecord>): Promise<void> {
    const current = this.getAttempt(attemptId);
    if (!current) {
      throw new Error(`unknown attempt id: ${attemptId}`);
    }
    const merged = { ...current, ...patch };
    const row = attemptRecordToRow(merged);
    this.getDb().update(attempts).set(row).where(eq(attempts.attemptId, attemptId)).run();
  }

  async appendEvent(event: AttemptEvent): Promise<void> {
    const row = attemptEventToRow(event);
    this.getDb().insert(attemptEvents).values(row).run();
  }

  sumArchivedSeconds(): number {
    const result = this.getDb()
      .select({
        total: sql<number>`COALESCE(SUM((julianday(ended_at) - julianday(started_at)) * 86400.0), 0.0)`,
      })
      .from(attempts)
      .where(isNotNull(attempts.endedAt))
      .get();
    return result?.total ?? 0;
  }

  sumCostUsd(): number {
    const rows = this.getDb()
      .select({
        model: attempts.model,
        inputTokens: sql<number>`COALESCE(SUM(input_tokens), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(output_tokens), 0)`,
      })
      .from(attempts)
      .where(isNotNull(attempts.endedAt))
      .groupBy(attempts.model)
      .all();
    return rows.reduce((total, row) => {
      const price = lookupModelPrice(row.model);
      if (!price) return total;
      return total + (row.inputTokens * price.inputUsd + row.outputTokens * price.outputUsd) / 1_000_000;
    }, 0);
  }

  /**
   * Migrate existing JSONL archive files into this SQLite database.
   * Idempotent — safe to call on every startup.
   */
  async migrateFromArchive(archiveDir: string): Promise<void> {
    const db = this.getDb();
    const existing = db.select().from(attempts).limit(1).all();
    if (existing.length > 0) return;

    const result = await migrateFromJsonl(db, archiveDir, this.logger);
    if (result.attemptCount > 0) {
      this.logger.info(
        { attempts: result.attemptCount, events: result.eventCount },
        "migrated JSONL archives to SQLite",
      );
    }
  }

  close(): void {
    if (this.db) {
      closeDatabase(this.db);
      this.db = null;
    }
  }

  private getDb(): SymphonyDatabase {
    if (!this.db) {
      throw new Error("SqliteAttemptStore not started — call start() first");
    }
    return this.db;
  }
}
