/**
 * SQLite-backed implementation of the AttemptStore interface.
 *
 * Provides the same public API as the JSONL-based `AttemptStore` but
 * persists data in a SQLite database for queryable, durable storage.
 */

import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { lookupModelPrice } from "../../core/model-pricing.js";
import type { OpenPrRecord, UpsertPrInput } from "../../core/attempt-store-port.js";
import type {
  AttemptCheckpointRecord,
  AttemptEvent,
  AttemptRecord,
  PrRecord,
  RisolutoLogger,
} from "../../core/types.js";
import type { RisolutoDatabase } from "./database.js";
import { attemptCheckpoints, attemptEvents, attempts, pullRequests } from "./schema.js";
import {
  rowToAttemptRecord,
  attemptRecordToRow,
  rowToAttemptEvent,
  attemptEventToRow,
  toAttemptCheckpointRecord,
  fromAttemptCheckpointRecord,
} from "./mappers.js";

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

  async appendCheckpoint(checkpoint: Omit<AttemptCheckpointRecord, "checkpointId" | "ordinal">): Promise<void> {
    // Get current max ordinal and last checkpoint row in a single query.
    const lastRow = this.getDb()
      .select()
      .from(attemptCheckpoints)
      .where(eq(attemptCheckpoints.attemptId, checkpoint.attemptId))
      .orderBy(desc(attemptCheckpoints.ordinal))
      .limit(1)
      .get();

    const nextOrdinal = lastRow ? lastRow.ordinal + 1 : 1;

    // Deduplication: skip write when last checkpoint is identical on key fields.
    if (lastRow) {
      const sameStatus = lastRow.status === checkpoint.status;
      const sameThread = (lastRow.threadId ?? null) === checkpoint.threadId;
      const sameTurn = (lastRow.turnId ?? null) === checkpoint.turnId;
      const sameTurnCount = lastRow.turnCount === checkpoint.turnCount;
      const sameTrigger = (lastRow.trigger ?? null) === checkpoint.trigger;
      if (sameStatus && sameThread && sameTurn && sameTurnCount && sameTrigger) {
        return;
      }
    }

    const row = fromAttemptCheckpointRecord({ ...checkpoint, ordinal: nextOrdinal });
    this.getDb().insert(attemptCheckpoints).values(row).run();
  }

  async listCheckpoints(attemptId: string): Promise<AttemptCheckpointRecord[]> {
    const rows = this.getDb()
      .select()
      .from(attemptCheckpoints)
      .where(eq(attemptCheckpoints.attemptId, attemptId))
      .orderBy(asc(attemptCheckpoints.ordinal))
      .all();
    return rows.map(toAttemptCheckpointRecord);
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

  async upsertPr(pr: UpsertPrInput): Promise<void> {
    const now = new Date().toISOString();
    const prId = `${pr.owner}/${pr.repo}#${pr.pullNumber}`;
    this.getDb()
      .insert(pullRequests)
      .values({
        prId,
        attemptId: pr.attemptId,
        issueId: pr.issueId,
        owner: pr.owner,
        repo: pr.repo,
        pullNumber: pr.pullNumber,
        url: pr.url,
        branchName: pr.branchName,
        status: pr.status,
        mergedAt: null,
        mergeCommitSha: null,
        createdAt: pr.createdAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pullRequests.url,
        set: {
          prId,
          attemptId: pr.attemptId,
          issueId: pr.issueId,
          owner: pr.owner,
          repo: pr.repo,
          pullNumber: pr.pullNumber,
          branchName: pr.branchName,
          status: pr.status,
          updatedAt: now,
        },
      })
      .run();
  }

  async getOpenPrs(): Promise<OpenPrRecord[]> {
    const rows = this.getDb().select().from(pullRequests).where(eq(pullRequests.status, "open")).all();
    return rows.map((row) => rowToPrRecord(row));
  }

  async getAllPrs(): Promise<OpenPrRecord[]> {
    const rows = this.getDb().select().from(pullRequests).all();
    return rows.map((row) => rowToPrRecord(row));
  }

  async updatePrStatus(
    url: string,
    status: "merged" | "closed",
    mergedAt?: string,
    mergeCommitSha?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.getDb()
      .update(pullRequests)
      .set({
        status,
        mergedAt: mergedAt ?? null,
        mergeCommitSha: mergeCommitSha ?? null,
        updatedAt: now,
      })
      .where(eq(pullRequests.url, url))
      .run();
  }

  private getDb(): RisolutoDatabase {
    return this.db;
  }
}

/** Map a pull_requests row to the domain OpenPrRecord type. */
function rowToPrRecord(row: {
  prId: string;
  attemptId: string | null;
  issueId: string;
  owner: string;
  repo: string;
  pullNumber: number;
  url: string;
  branchName: string;
  status: string;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
}): OpenPrRecord {
  const prRecord: PrRecord = {
    prId: row.prId,
    attemptId: row.attemptId ?? "",
    issueId: row.issueId,
    owner: row.owner,
    repo: row.repo,
    pullNumber: row.pullNumber,
    url: row.url,
    status: row.status as PrRecord["status"],
    mergedAt: row.mergedAt,
    mergeCommitSha: row.mergeCommitSha,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return { ...prRecord, branchName: row.branchName };
}
