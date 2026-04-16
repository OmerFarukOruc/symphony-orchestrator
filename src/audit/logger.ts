/**
 * Audit logger — records config, secret, and template mutations
 * to the `config_history` table with old + new values.
 *
 * Secret values are stored as "[REDACTED]" for both previousValue
 * and newValue.
 */

import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { RisolutoDatabase } from "../persistence/sqlite/database.js";
import { configHistory } from "../persistence/sqlite/schema.js";
import type { AuditLoggerPort } from "./port.js";
import type { AuditEntry, AuditQueryOptions, AuditRecord } from "./types.js";

export type { AuditEntry, AuditQueryOptions, AuditRecord };

const REDACTED = "[REDACTED]";

interface WhereResult {
  where: string;
  params: unknown[];
}

const FILTER_MAP: Array<{
  key: keyof AuditQueryOptions;
  condition: string;
  transform?: (value: string) => unknown[];
}> = [
  { key: "tableName", condition: "table_name = ?" },
  {
    key: "key",
    condition: String.raw`key LIKE ? ESCAPE '\'`,
    transform: (value) => {
      const escaped = value
        .replaceAll("\\", String.raw`\\`)
        .replaceAll("%", String.raw`\%`)
        .replaceAll("_", String.raw`\_`);
      return [`%${escaped}%`];
    },
  },
  {
    key: "pathPrefix",
    condition: String.raw`(path LIKE ? ESCAPE '\' OR key LIKE ? ESCAPE '\')`,
    transform: (value) => {
      const escaped = value
        .replaceAll("\\", String.raw`\\`)
        .replaceAll("%", String.raw`\%`)
        .replaceAll("_", String.raw`\_`);
      return [`${escaped}%`, `${escaped}%`];
    },
  },
  { key: "from", condition: "timestamp >= ?" },
  { key: "to", condition: "timestamp <= ?" },
];

function buildWhereClause(options?: AuditQueryOptions): WhereResult {
  const conditions: string[] = [];
  const params: unknown[] = [];

  for (const filter of FILTER_MAP) {
    const value = options?.[filter.key];
    if (typeof value !== "string") continue;
    conditions.push(filter.condition);
    params.push(...(filter.transform ? filter.transform(value) : [value]));
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export class AuditLogger implements AuditLoggerPort {
  constructor(
    private readonly db: RisolutoDatabase,
    private readonly eventBus?: TypedEventBus<RisolutoEventMap>,
  ) {}

  log(entry: AuditEntry): void {
    const isSecret = entry.tableName === "secrets";
    const path = entry.path ?? null;
    const actor = entry.actor ?? "dashboard";
    const timestamp = new Date().toISOString();

    this.db
      .insert(configHistory)
      .values({
        tableName: entry.tableName,
        key: entry.key,
        path,
        operation: entry.operation,
        previousValue: isSecret ? REDACTED : (entry.previousValue ?? null),
        newValue: isSecret ? REDACTED : (entry.newValue ?? null),
        actor,
        requestId: entry.requestId ?? null,
        timestamp,
      })
      .run();

    this.eventBus?.emit("audit.mutation", {
      tableName: entry.tableName,
      key: entry.key,
      path,
      operation: entry.operation,
      actor,
      timestamp,
    });
  }

  logConfigChange(key: string, previousValue: string | null, newValue: string | null, path?: string): void {
    this.log({
      tableName: "config",
      key,
      path,
      operation: previousValue === null ? "create" : "update",
      previousValue,
      newValue,
    });
  }

  logSecretChange(key: string, operation: "set" | "delete"): void {
    this.log({ tableName: "secrets", key, operation });
  }

  logTemplateChange(
    templateId: string,
    operation: "create" | "update" | "delete",
    previousBody?: string | null,
    newBody?: string | null,
  ): void {
    this.log({
      tableName: "prompt_templates",
      key: templateId,
      operation,
      previousValue: previousBody ?? null,
      newValue: newBody ?? null,
    });
  }

  query(options?: AuditQueryOptions): AuditRecord[] {
    const { where, params } = buildWhereClause(options);
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const sql = `SELECT * FROM config_history ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.$client.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map(rowToAuditRecord);
  }

  count(options?: AuditQueryOptions): number {
    const { where, params } = buildWhereClause(options);
    const result = this.db.$client.prepare(`SELECT COUNT(*) as count FROM config_history ${where}`).get(...params) as {
      count: number;
    };
    return result.count;
  }
}

function rowToAuditRecord(row: Record<string, unknown>): AuditRecord {
  return {
    id: row.id as number,
    tableName: row.table_name as string,
    key: row.key as string,
    path: (row.path as string) ?? null,
    operation: row.operation as string,
    previousValue: (row.previous_value as string) ?? null,
    newValue: (row.new_value as string) ?? null,
    actor: (row.actor as string) ?? "dashboard",
    requestId: (row.request_id as string) ?? null,
    timestamp: row.timestamp as string,
  };
}
