import { randomUUID } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";

import type { NotificationDeliveryFailure, NotificationSeverity } from "../core/types.js";
import type { RisolutoDatabase } from "../persistence/sqlite/database.js";
import { normalizeLimit } from "../persistence/sqlite/query-helpers.js";
import { alertHistory } from "../persistence/sqlite/schema.js";
import { isRecord } from "../utils/type-guards.js";

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
  static create(db: RisolutoDatabase): AlertHistoryStorePort {
    return new SqliteAlertHistoryStore(db);
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
      .orderBy(desc(alertHistory.createdAt), desc(sql`rowid`))
      .limit(limit)
      .all();
    return rows.map(toRecord);
  }
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
            if (!isRecord(entry)) {
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
