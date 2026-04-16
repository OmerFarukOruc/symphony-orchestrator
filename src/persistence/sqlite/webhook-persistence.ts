import type { RisolutoLogger } from "../../core/types.js";
import type { RisolutoDatabase } from "./database.js";
import { SqliteWebhookInbox, type WebhookDeliveryRecord, type WebhookInboxStats } from "./webhook-inbox.js";

export interface WebhookPersistenceSnapshot {
  stats: WebhookInboxStats;
  recent: WebhookDeliveryRecord[];
}

export interface WebhookPersistence {
  inbox: SqliteWebhookInbox;
  getSnapshot(limit?: number): Promise<WebhookPersistenceSnapshot>;
  getRecentDeliveries(limit?: number): Promise<WebhookDeliveryRecord[]>;
  getStats(): Promise<WebhookInboxStats>;
  getRetryDeliveries(): Promise<WebhookDeliveryRecord[]>;
}

export function createWebhookPersistence(db: RisolutoDatabase, logger: RisolutoLogger): WebhookPersistence {
  const inbox = new SqliteWebhookInbox(db, logger);

  return {
    inbox,
    async getSnapshot(limit = 20): Promise<WebhookPersistenceSnapshot> {
      const [stats, recent] = await Promise.all([inbox.getStats(), inbox.getRecent(limit)]);
      return { stats, recent };
    },
    getRecentDeliveries(limit = 20): Promise<WebhookDeliveryRecord[]> {
      return inbox.getRecent(limit);
    },
    getStats(): Promise<WebhookInboxStats> {
      return inbox.getStats();
    },
    getRetryDeliveries(): Promise<WebhookDeliveryRecord[]> {
      return inbox.fetchDueForRetry();
    },
  };
}
