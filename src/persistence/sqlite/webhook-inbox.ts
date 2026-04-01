/**
 * Webhook inbox — durable persistence layer for verified Linear webhook deliveries.
 *
 * Provides:
 * - Idempotent insert (dedup by delivery_id)
 * - Status lifecycle management (received → processing → applied/ignored/retry/dead_letter)
 * - Retry queue (fetch items due for retry)
 * - DLQ management (persistent failures)
 * - Metrics (backlog size, oldest age, DLQ count)
 */

import { eq, and, isNull, or, lt, desc, sql } from "drizzle-orm";

import type { RisolutoDatabase } from "./database.js";
import { webhookInbox } from "./schema.js";
import type { RisolutoLogger } from "../../core/types.js";

export type WebhookInboxStatus = "received" | "processing" | "applied" | "ignored" | "retry" | "dead_letter";

export interface WebhookDeliveryRecord {
  deliveryId: string;
  receivedAt: string;
  type: string;
  action: string;
  entityId: string | null;
  issueId: string | null;
  issueIdentifier: string | null;
  webhookTimestamp: number | null;
  payloadJson: string | null;
  status: WebhookInboxStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  appliedAt: string | null;
}

export interface WebhookInboxStats {
  backlogCount: number;
  oldestBacklogAgeSeconds: number | null;
  dlqCount: number;
  duplicateCount: number;
  lastDeliveryAgeSeconds: number | null;
}

export interface WebhookInboxStore {
  /** Insert a verified delivery. Returns true if new, false if duplicate. */
  insertVerified(delivery: {
    deliveryId: string;
    type: string;
    action: string;
    entityId: string | null;
    issueId: string | null;
    issueIdentifier: string | null;
    webhookTimestamp: number | null;
    payloadJson: string | null;
  }): Promise<{ isNew: boolean }>;

  /** Mark a delivery as being processed. */
  markProcessing(deliveryId: string): Promise<void>;

  /** Mark a delivery as successfully applied. */
  markApplied(deliveryId: string): Promise<void>;

  /** Mark a delivery as ignored (unsupported type, no-op). */
  markIgnored(deliveryId: string): Promise<void>;

  /** Schedule a delivery for retry with backoff. */
  markForRetry(deliveryId: string, error: string, attemptCount: number, nextAttemptAt: string): Promise<void>;

  /** Move a delivery to the dead-letter queue. */
  markDeadLetter(deliveryId: string, error: string): Promise<void>;

  /** Fetch deliveries due for retry. */
  fetchDueForRetry(): Promise<WebhookDeliveryRecord[]>;

  /** Get current inbox statistics. */
  getStats(): Promise<WebhookInboxStats>;

  /** Get recent deliveries for dashboard display. */
  getRecent(limit?: number): Promise<WebhookDeliveryRecord[]>;
}

export class SqliteWebhookInbox implements WebhookInboxStore {
  private readonly db: RisolutoDatabase;
  private readonly logger: RisolutoLogger;

  constructor(db: RisolutoDatabase, logger: RisolutoLogger) {
    this.db = db;
    this.logger = logger.child({ component: "webhook-inbox" });
  }

  async insertVerified(delivery: {
    deliveryId: string;
    type: string;
    action: string;
    entityId: string | null;
    issueId: string | null;
    issueIdentifier: string | null;
    webhookTimestamp: number | null;
    payloadJson: string | null;
  }): Promise<{ isNew: boolean }> {
    const now = new Date().toISOString();
    try {
      this.db
        .insert(webhookInbox)
        .values({
          deliveryId: delivery.deliveryId,
          receivedAt: now,
          type: delivery.type,
          action: delivery.action,
          entityId: delivery.entityId,
          issueId: delivery.issueId,
          issueIdentifier: delivery.issueIdentifier,
          webhookTimestamp: delivery.webhookTimestamp,
          payloadJson: delivery.payloadJson,
          status: "received",
          attemptCount: 0,
        })
        .run();
      return { isNew: true };
    } catch (error_) {
      const error = error_ as Error;
      // UNIQUE constraint violation on delivery_id — this is a duplicate
      if (error.message.includes("UNIQUE constraint failed") || error.message.includes("unique constraint")) {
        return { isNew: false };
      }
      throw error_;
    }
  }

  async markProcessing(deliveryId: string): Promise<void> {
    this.db.update(webhookInbox).set({ status: "processing" }).where(eq(webhookInbox.deliveryId, deliveryId)).run();
  }

  async markApplied(deliveryId: string): Promise<void> {
    this.db
      .update(webhookInbox)
      .set({ status: "applied", appliedAt: new Date().toISOString() })
      .where(eq(webhookInbox.deliveryId, deliveryId))
      .run();
  }

  async markIgnored(deliveryId: string): Promise<void> {
    this.db
      .update(webhookInbox)
      .set({ status: "ignored", appliedAt: new Date().toISOString() })
      .where(eq(webhookInbox.deliveryId, deliveryId))
      .run();
  }

  async markForRetry(deliveryId: string, error: string, attemptCount: number, nextAttemptAt: string): Promise<void> {
    this.db
      .update(webhookInbox)
      .set({
        status: "retry",
        attemptCount,
        nextAttemptAt,
        lastError: error.length > 500 ? error.slice(0, 500) : error,
      })
      .where(eq(webhookInbox.deliveryId, deliveryId))
      .run();
  }

  async markDeadLetter(deliveryId: string, error: string): Promise<void> {
    this.db
      .update(webhookInbox)
      .set({
        status: "dead_letter",
        lastError: error.length > 500 ? error.slice(0, 500) : error,
      })
      .where(eq(webhookInbox.deliveryId, deliveryId))
      .run();
  }

  async fetchDueForRetry(): Promise<WebhookDeliveryRecord[]> {
    const now = new Date().toISOString();
    const rows = this.db
      .select()
      .from(webhookInbox)
      .where(
        and(
          eq(webhookInbox.status, "retry"),
          or(isNull(webhookInbox.nextAttemptAt), lt(webhookInbox.nextAttemptAt, now)),
        ),
      )
      .all();
    return rows.map(toRecord);
  }

  async getStats(): Promise<WebhookInboxStats> {
    const backlogRow = this.db
      .select({ count: sql<number>`count(*)` })
      .from(webhookInbox)
      .where(
        and(
          eq(webhookInbox.status, "received"),
          or(isNull(webhookInbox.nextAttemptAt), lt(webhookInbox.nextAttemptAt, new Date().toISOString())),
        ),
      )
      .get();
    const backlogCount = backlogRow?.count ?? 0;

    const oldestRow = this.db
      .select({ receivedAt: webhookInbox.receivedAt })
      .from(webhookInbox)
      .where(eq(webhookInbox.status, "received"))
      .orderBy(webhookInbox.receivedAt)
      .limit(1)
      .get();
    const oldestBacklogAgeSeconds = oldestRow
      ? Math.floor((Date.now() - new Date(oldestRow.receivedAt).getTime()) / 1000)
      : null;

    const dlqRow = this.db
      .select({ count: sql<number>`count(*)` })
      .from(webhookInbox)
      .where(eq(webhookInbox.status, "dead_letter"))
      .get();
    const dlqCount = dlqRow?.count ?? 0;

    // Count duplicates by checking how many deliveries were attempted but found duplicate
    // This is tracked externally via metrics, not in the DB
    const duplicateCount = 0; // tracked by metrics counter

    const lastDeliveryRow = this.db
      .select({ receivedAt: webhookInbox.receivedAt })
      .from(webhookInbox)
      .orderBy(desc(webhookInbox.receivedAt))
      .limit(1)
      .get();
    const lastDeliveryAgeSeconds = lastDeliveryRow
      ? Math.floor((Date.now() - new Date(lastDeliveryRow.receivedAt).getTime()) / 1000)
      : null;

    return { backlogCount, oldestBacklogAgeSeconds, dlqCount, duplicateCount, lastDeliveryAgeSeconds };
  }

  async getRecent(limit = 20): Promise<WebhookDeliveryRecord[]> {
    const rows = this.db.select().from(webhookInbox).orderBy(desc(webhookInbox.receivedAt)).limit(limit).all();
    return rows.map(toRecord);
  }
}

function toRecord(row: typeof webhookInbox.$inferSelect): WebhookDeliveryRecord {
  return {
    deliveryId: row.deliveryId,
    receivedAt: row.receivedAt,
    type: row.type,
    action: row.action,
    entityId: row.entityId,
    issueId: row.issueId,
    issueIdentifier: row.issueIdentifier,
    webhookTimestamp: row.webhookTimestamp,
    payloadJson: row.payloadJson,
    status: row.status as WebhookInboxStatus,
    attemptCount: row.attemptCount,
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError,
    appliedAt: row.appliedAt,
  };
}
