import { randomUUID } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";

import type { NotificationDeliverySummary, NotificationRecord } from "../../core/notification-types.js";
import { normalizeLimit } from "./query-helpers.js";
import type { RisolutoDatabase } from "./database.js";
import { notifications } from "./schema.js";

export interface CreateNotificationInput {
  type: string;
  severity: NotificationRecord["severity"];
  title: string;
  message: string;
  source: string | null;
  href: string | null;
  dedupeKey: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
}

export interface NotificationStorePort {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  list(options?: ListNotificationsOptions): Promise<NotificationRecord[]>;
  countAll(): Promise<number>;
  countUnread(): Promise<number>;
  updateDeliverySummary(id: string, deliverySummary: NotificationDeliverySummary): Promise<NotificationRecord | null>;
  markRead(id: string): Promise<NotificationRecord | null>;
  markAllRead(): Promise<{ updatedCount: number; unreadCount: number }>;
}

export class NotificationStore {
  static create(db: RisolutoDatabase): NotificationStorePort {
    return new SqliteNotificationStore(db);
  }
}

class SqliteNotificationStore implements NotificationStorePort {
  constructor(private readonly db: RisolutoDatabase) {}

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    const record: NotificationRecord = {
      id: randomUUID(),
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      source: input.source,
      href: input.href,
      read: false,
      dedupeKey: input.dedupeKey,
      metadata: cloneMetadata(input.metadata),
      deliverySummary: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.db
      .insert(notifications)
      .values({
        id: record.id,
        type: record.type,
        severity: record.severity,
        title: record.title,
        message: record.message,
        source: record.source,
        href: record.href,
        read: record.read,
        dedupeKey: record.dedupeKey,
        metadata: stringifyJson(record.metadata),
        deliverySummary: null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
      .run();
    return cloneRecord(record);
  }

  async list(options: ListNotificationsOptions = {}): Promise<NotificationRecord[]> {
    const limit = normalizeLimit(options.limit);
    const rows = (
      options.unreadOnly
        ? this.db.select().from(notifications).where(eq(notifications.read, false))
        : this.db.select().from(notifications)
    )
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .all();
    return rows.map(toRecord);
  }

  async countAll(): Promise<number> {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .get();
    return row?.count ?? 0;
  }

  async countUnread(): Promise<number> {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.read, false))
      .get();
    return row?.count ?? 0;
  }

  async updateDeliverySummary(
    id: string,
    deliverySummary: NotificationDeliverySummary,
  ): Promise<NotificationRecord | null> {
    const updatedAt = new Date().toISOString();
    this.db
      .update(notifications)
      .set({
        deliverySummary: stringifyJson(deliverySummary),
        updatedAt,
      })
      .where(eq(notifications.id, id))
      .run();
    return this.getById(id);
  }

  async markRead(id: string): Promise<NotificationRecord | null> {
    const current = await this.getById(id);
    if (!current) {
      return null;
    }
    if (current.read) {
      return current;
    }
    const updatedAt = new Date().toISOString();
    this.db.update(notifications).set({ read: true, updatedAt }).where(eq(notifications.id, id)).run();
    return this.getById(id);
  }

  async markAllRead(): Promise<{ updatedCount: number; unreadCount: number }> {
    const unreadCount = await this.countUnread();
    if (unreadCount === 0) {
      return { updatedCount: 0, unreadCount: 0 };
    }
    const updatedAt = new Date().toISOString();
    this.db.update(notifications).set({ read: true, updatedAt }).where(eq(notifications.read, false)).run();
    return { updatedCount: unreadCount, unreadCount: 0 };
  }

  private async getById(id: string): Promise<NotificationRecord | null> {
    const row = this.db.select().from(notifications).where(eq(notifications.id, id)).get();
    return row ? toRecord(row) : null;
  }
}

// eslint-disable-next-line sonarjs/function-return-type
function stringifyJson(value: Record<string, unknown> | NotificationDeliverySummary | null): string | null {
  if (value === null) {
    return null;
  }
  return JSON.stringify(value);
}

// eslint-disable-next-line sonarjs/function-return-type
function parseJson<T>(value: string | null): T | null {
  if (value === null) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toRecord(row: typeof notifications.$inferSelect): NotificationRecord {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    source: row.source,
    href: row.href,
    read: row.read,
    dedupeKey: row.dedupeKey,
    metadata: parseJson<Record<string, unknown>>(row.metadata),
    deliverySummary: parseJson<NotificationDeliverySummary>(row.deliverySummary),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function cloneRecord(record: NotificationRecord): NotificationRecord {
  return {
    ...record,
    metadata: cloneMetadata(record.metadata),
    deliverySummary: cloneDeliverySummary(record.deliverySummary),
  };
}

function cloneMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  return metadata ? { ...metadata } : null;
}

// eslint-disable-next-line sonarjs/function-return-type
function cloneDeliverySummary(summary: NotificationDeliverySummary | null): NotificationDeliverySummary | null {
  if (summary === null) {
    return null;
  }
  return {
    deliveredChannels: [...summary.deliveredChannels],
    failedChannels: summary.failedChannels.map((failure) => ({ ...failure })),
    skippedDuplicate: summary.skippedDuplicate,
  };
}
