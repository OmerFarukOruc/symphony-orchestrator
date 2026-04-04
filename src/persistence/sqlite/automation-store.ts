import { randomUUID } from "node:crypto";

import { desc, eq, sql } from "drizzle-orm";

import type { AutomationMode } from "../../core/types.js";
import type { AutomationRunRecord, AutomationRunStatus, AutomationRunTrigger } from "../../automation/types.js";
import type { RisolutoDatabase } from "./database.js";
import { automationRuns } from "./schema.js";

export interface CreateAutomationRunInput {
  automationName: string;
  mode: AutomationMode;
  trigger: AutomationRunTrigger;
  repoUrl: string | null;
  startedAt: string;
}

export interface FinishAutomationRunInput {
  status: Exclude<AutomationRunStatus, "running">;
  output: string | null;
  details: Record<string, unknown> | null;
  issueId: string | null;
  issueIdentifier: string | null;
  issueUrl: string | null;
  error: string | null;
  finishedAt: string;
}

export interface ListAutomationRunsOptions {
  limit?: number;
  automationName?: string;
}

export interface AutomationStorePort {
  createRun(input: CreateAutomationRunInput): Promise<AutomationRunRecord>;
  finishRun(id: string, input: FinishAutomationRunInput): Promise<AutomationRunRecord | null>;
  listRuns(options?: ListAutomationRunsOptions): Promise<AutomationRunRecord[]>;
  countRuns(): Promise<number>;
}

export class AutomationStore {
  static create(db: RisolutoDatabase | null): AutomationStorePort {
    return db ? new SqliteAutomationStore(db) : new MemoryAutomationStore();
  }
}

class SqliteAutomationStore implements AutomationStorePort {
  constructor(private readonly db: RisolutoDatabase) {}

  async createRun(input: CreateAutomationRunInput): Promise<AutomationRunRecord> {
    const record: AutomationRunRecord = {
      id: randomUUID(),
      automationName: input.automationName,
      mode: input.mode,
      trigger: input.trigger,
      repoUrl: input.repoUrl,
      status: "running",
      output: null,
      details: null,
      issueId: null,
      issueIdentifier: null,
      issueUrl: null,
      error: null,
      startedAt: input.startedAt,
      finishedAt: null,
    };
    this.db
      .insert(automationRuns)
      .values({
        id: record.id,
        automationName: record.automationName,
        mode: record.mode,
        trigger: record.trigger,
        repoUrl: record.repoUrl,
        status: record.status,
        output: record.output,
        details: null,
        issueId: null,
        issueIdentifier: null,
        issueUrl: null,
        error: null,
        startedAt: record.startedAt,
        finishedAt: null,
      })
      .run();
    return cloneAutomationRun(record);
  }

  async finishRun(id: string, input: FinishAutomationRunInput): Promise<AutomationRunRecord | null> {
    this.db
      .update(automationRuns)
      .set({
        status: input.status,
        output: input.output,
        details: stringifyJson(input.details),
        issueId: input.issueId,
        issueIdentifier: input.issueIdentifier,
        issueUrl: input.issueUrl,
        error: input.error,
        finishedAt: input.finishedAt,
      })
      .where(eq(automationRuns.id, id))
      .run();
    return this.getById(id);
  }

  async listRuns(options: ListAutomationRunsOptions = {}): Promise<AutomationRunRecord[]> {
    const limit = normalizeLimit(options.limit);
    const rows = (
      options.automationName
        ? this.db.select().from(automationRuns).where(eq(automationRuns.automationName, options.automationName))
        : this.db.select().from(automationRuns)
    )
      .orderBy(desc(automationRuns.startedAt))
      .limit(limit)
      .all();
    return rows.map(toAutomationRunRecord);
  }

  async countRuns(): Promise<number> {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(automationRuns)
      .get();
    return row?.count ?? 0;
  }

  private async getById(id: string): Promise<AutomationRunRecord | null> {
    const row = this.db.select().from(automationRuns).where(eq(automationRuns.id, id)).get();
    return row ? toAutomationRunRecord(row) : null;
  }
}

class MemoryAutomationStore implements AutomationStorePort {
  private readonly records = new Map<string, AutomationRunRecord>();

  async createRun(input: CreateAutomationRunInput): Promise<AutomationRunRecord> {
    const record: AutomationRunRecord = {
      id: randomUUID(),
      automationName: input.automationName,
      mode: input.mode,
      trigger: input.trigger,
      repoUrl: input.repoUrl,
      status: "running",
      output: null,
      details: null,
      issueId: null,
      issueIdentifier: null,
      issueUrl: null,
      error: null,
      startedAt: input.startedAt,
      finishedAt: null,
    };
    this.records.set(record.id, cloneAutomationRun(record));
    return cloneAutomationRun(record);
  }

  async finishRun(id: string, input: FinishAutomationRunInput): Promise<AutomationRunRecord | null> {
    const existing = this.records.get(id);
    if (!existing) {
      return null;
    }
    const updated: AutomationRunRecord = {
      ...existing,
      status: input.status,
      output: input.output,
      details: cloneDetails(input.details),
      issueId: input.issueId,
      issueIdentifier: input.issueIdentifier,
      issueUrl: input.issueUrl,
      error: input.error,
      finishedAt: input.finishedAt,
    };
    this.records.set(id, cloneAutomationRun(updated));
    return cloneAutomationRun(updated);
  }

  async listRuns(options: ListAutomationRunsOptions = {}): Promise<AutomationRunRecord[]> {
    const limit = normalizeLimit(options.limit);
    return [...this.records.values()]
      .filter((record) => !options.automationName || record.automationName === options.automationName)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit)
      .map((record) => cloneAutomationRun(record));
  }

  async countRuns(): Promise<number> {
    return this.records.size;
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return 100;
  }
  return Math.max(1, Math.min(500, Math.trunc(limit)));
}

function stringifyJson(value: Record<string, unknown> | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toAutomationRunRecord(row: typeof automationRuns.$inferSelect): AutomationRunRecord {
  return {
    id: row.id,
    automationName: row.automationName,
    mode: row.mode,
    trigger: row.trigger,
    repoUrl: row.repoUrl,
    status: row.status,
    output: row.output,
    details: parseJson(row.details),
    issueId: row.issueId,
    issueIdentifier: row.issueIdentifier,
    issueUrl: row.issueUrl,
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

function cloneAutomationRun(record: AutomationRunRecord): AutomationRunRecord {
  return {
    ...record,
    details: cloneDetails(record.details),
  };
}

function cloneDetails(details: Record<string, unknown> | null): Record<string, unknown> | null {
  return details ? { ...details } : null;
}
