import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import type { NotificationDeliveryFailure, NotificationSeverity } from "../core/types.js";
import type { RisolutoDatabase } from "../persistence/sqlite/database.js";
import { alertHistory } from "../persistence/sqlite/schema.js";

export type AlertHistoryStatus = "delivered" | "suppressed" | "partial_failure" | "failed";

export interface AlertHistoryRecord {
  id: string;
  ruleName: string;
  eventType: string;
  severity: NotificationSeverity;
  status: AlertHistoryStatus;
  channels: string[];
  deliveredChannels: string[];
  failedChannels: NotificationDeliveryFailure[];
  message: string;
  createdAt: string;
}

export interface CreateAlertHistoryInput {
  ruleName: string;
  eventType: string;
  severity: NotificationSeverity;
  status: AlertHistoryStatus;
  channels: string[];
  deliveredChannels: string[];
  failedChannels: NotificationDeliveryFailure[];
  message: string;
  createdAt: string;
}

export interface ListAlertHistoryOptions {
  limit?: number;
  ruleName?: string;
}

export interface AlertHistoryStorePort {
  create(input: CreateAlertHistoryInput): Promise<AlertHistoryRecord>;
  list(options?: ListAlertHistoryOptions): Promise<AlertHistoryRecord[]>;
}

export class AlertHistoryStore {
  static create(db: RisolutoDatabase | null): AlertHistoryStorePort {
    return db ? new SqliteAlertHistoryStore(db) : new MemoryAlertHistoryStore();
  }
}

class SqliteAlertHistoryStore implements AlertHistoryStorePort {
  constructor(private readonly db: RisolutoDatabase) {}

  async create(input: CreateAlertHistoryInput): Promise<AlertHistoryRecord> {
    const record: AlertHistoryRecord = {
      id: randomUUID(),
      ruleName: input.ruleName,
      eventType: input.eventType,
      severity: input.severity,
      status: input.status,
      channels: [...input.channels],
      deliveredChannels: [...input.deliveredChannels],
      failedChannels: input.failedChannels.map((failure) => ({ ...failure })),
      message: input.message,
      createdAt: input.createdAt,
    };
    this.db
      .insert(alertHistory)
      .values({
        id: record.id,
        ruleName: record.ruleName,
        eventType: record.eventType,
        severity: record.severity,
        status: record.status,
        channels: JSON.stringify(record.channels),
        deliveredChannels: JSON.stringify(record.deliveredChannels),
        failedChannels: JSON.stringify(record.failedChannels),
        message: record.message,
        createdAt: record.createdAt,
      })
      .run();
    return cloneRecord(record);
  }

  async list(options: ListAlertHistoryOptions = {}): Promise<AlertHistoryRecord[]> {
    const limit = normalizeLimit(options.limit);
    const rows = (
      options.ruleName
        ? this.db.select().from(alertHistory).where(eq(alertHistory.ruleName, options.ruleName))
        : this.db.select().from(alertHistory)
    )
      .orderBy(desc(alertHistory.createdAt))
      .limit(limit)
      .all();
    return rows.map(toRecord);
  }
}

class MemoryAlertHistoryStore implements AlertHistoryStorePort {
  private readonly records = new Map<string, AlertHistoryRecord>();

  async create(input: CreateAlertHistoryInput): Promise<AlertHistoryRecord> {
    const record: AlertHistoryRecord = {
      id: randomUUID(),
      ruleName: input.ruleName,
      eventType: input.eventType,
      severity: input.severity,
      status: input.status,
      channels: [...input.channels],
      deliveredChannels: [...input.deliveredChannels],
      failedChannels: input.failedChannels.map((failure) => ({ ...failure })),
      message: input.message,
      createdAt: input.createdAt,
    };
    this.records.set(record.id, cloneRecord(record));
    return cloneRecord(record);
  }

  async list(options: ListAlertHistoryOptions = {}): Promise<AlertHistoryRecord[]> {
    const limit = normalizeLimit(options.limit);
    return [...this.records.values()]
      .filter((record) => !options.ruleName || record.ruleName === options.ruleName)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((record) => cloneRecord(record));
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return 100;
  }
  return Math.max(1, Math.min(500, Math.trunc(limit)));
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function parseFailures(value: string): NotificationDeliveryFailure[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }
            const record = entry as Record<string, unknown>;
            const channel = typeof record.channel === "string" ? record.channel : null;
            const error = typeof record.error === "string" ? record.error : null;
            return channel && error ? { channel, error } : null;
          })
          .filter((entry): entry is NotificationDeliveryFailure => entry !== null)
      : [];
  } catch {
    return [];
  }
}

function toRecord(row: typeof alertHistory.$inferSelect): AlertHistoryRecord {
  return {
    id: row.id,
    ruleName: row.ruleName,
    eventType: row.eventType,
    severity: row.severity,
    status: row.status,
    channels: parseStringArray(row.channels),
    deliveredChannels: parseStringArray(row.deliveredChannels),
    failedChannels: parseFailures(row.failedChannels),
    message: row.message,
    createdAt: row.createdAt,
  };
}

function cloneRecord(record: AlertHistoryRecord): AlertHistoryRecord {
  return {
    ...record,
    channels: [...record.channels],
    deliveredChannels: [...record.deliveredChannels],
    failedChannels: record.failedChannels.map((failure) => ({ ...failure })),
  };
}
