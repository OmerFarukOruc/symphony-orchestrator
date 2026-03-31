/**
 * SQLite-backed implementation of the AttemptStore interface.
 *
 * Provides the same public API as the JSONL-based `AttemptStore` but
 * persists data in a SQLite database for queryable, durable storage.
 */

import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { lookupModelPrice } from "../../core/model-pricing.js";
import type { AttemptEvent, AttemptRecord, RisolutoLogger } from "../../core/types.js";
import type { RisolutoDatabase } from "./database.js";
import { attemptEvents, attempts } from "./schema.js";
import { rowToAttemptRecord, attemptRecordToRow, rowToAttemptEvent, attemptEventToRow } from "./mappers.js";

export class SqliteAttemptStore {
  private readonly db: RisolutoDatabase;

  constructor(db: RisolutoDatabase, logger: RisolutoLogger) {
    this.db = db;
    logger.info("SQLite attempt store initialized (shared connection)");
  }

  /** No-op — connection is managed by PersistenceRuntime. */
  async start(): Promise<void> {
    /* connection already open via shared runtime */
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

  sumArchivedTokens(): { inputTokens: number; outputTokens: number; totalTokens: number } {
    const result = this.getDb()
      .select({
        inputTokens: sql<number>`COALESCE(SUM(input_tokens), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(output_tokens), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(total_tokens), 0)`,
      })
      .from(attempts)
      .get();
    return {
      inputTokens: result?.inputTokens ?? 0,
      outputTokens: result?.outputTokens ?? 0,
      totalTokens: result?.totalTokens ?? 0,
    };
  }

  private getDb(): RisolutoDatabase {
    return this.db;
  }
}
