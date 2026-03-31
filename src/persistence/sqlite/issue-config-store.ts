/**
 * Issue-level configuration store backed by the SQLite `issue_config` table.
 *
 * Persists per-issue model overrides and prompt template assignments so they
 * survive process restarts. The orchestrator loads all rows at startup and
 * writes back on every mutation.
 */

import { eq } from "drizzle-orm";

import type { RisolutoDatabase } from "./database.js";
import { issueConfig } from "./schema.js";

export interface IssueConfigRow {
  identifier: string;
  model: string | null;
  reasoningEffort: string | null;
  templateId: string | null;
}

export class IssueConfigStore {
  /**
   * Creates a real store backed by `db`, or a no-op store when `db` is null.
   * Use this factory in service wiring so callers don't need to branch.
   */
  static create(db: RisolutoDatabase | null): IssueConfigStore {
    return db ? new IssueConfigStore(db) : new NoopIssueConfigStore();
  }

  constructor(private readonly db: RisolutoDatabase) {}

  /**
   * Returns all rows from the `issue_config` table.
   * Synchronous — uses better-sqlite3 under the hood.
   */
  loadAll(): IssueConfigRow[] {
    return this.db
      .select()
      .from(issueConfig)
      .all()
      .map((row) => ({
        identifier: row.identifier,
        model: row.model ?? null,
        reasoningEffort: row.reasoningEffort ?? null,
        templateId: row.templateId ?? null,
      }));
  }

  /**
   * Inserts or updates the model/reasoningEffort columns for an identifier.
   * Preserves the existing template_id if a row already exists.
   */
  upsertModel(identifier: string, model: string, reasoningEffort: string | null): void {
    this.db
      .insert(issueConfig)
      .values({ identifier, model, reasoningEffort: reasoningEffort as never })
      .onConflictDoUpdate({
        target: [issueConfig.identifier],
        set: { model, reasoningEffort: reasoningEffort as never },
      })
      .run();
  }

  /**
   * Inserts or updates the template_id column for an identifier.
   * Preserves the existing model/reasoningEffort columns if a row already exists.
   */
  upsertTemplateId(identifier: string, templateId: string): void {
    this.db
      .insert(issueConfig)
      .values({ identifier, templateId })
      .onConflictDoUpdate({
        target: [issueConfig.identifier],
        set: { templateId },
      })
      .run();
  }

  /**
   * Sets template_id to NULL for the given identifier.
   * Does nothing if the row does not exist.
   */
  clearTemplateId(identifier: string): void {
    this.db.update(issueConfig).set({ templateId: null }).where(eq(issueConfig.identifier, identifier)).run();
  }

  /** Returns the template_id for a single identifier, or null if not set / row absent. */
  getTemplateId(identifier: string): string | null {
    const row = this.db
      .select({ templateId: issueConfig.templateId })
      .from(issueConfig)
      .where(eq(issueConfig.identifier, identifier))
      .get();
    return row?.templateId ?? null;
  }
}

/**
 * No-op implementation used when SQLite persistence is disabled.
 * All writes are silently discarded; reads return an empty set.
 */
class NoopIssueConfigStore extends IssueConfigStore {
  // Bypass the parent constructor's db requirement with a minimal stub.
  constructor() {
    super(null as never);
  }

  override loadAll(): IssueConfigRow[] {
    return [];
  }

  override upsertModel(_identifier: string, _model: string, _reasoningEffort: string | null): void {
    // no-op
  }

  override upsertTemplateId(_identifier: string, _templateId: string): void {
    // no-op
  }

  override clearTemplateId(_identifier: string): void {
    // no-op
  }

  override getTemplateId(_identifier: string): string | null {
    return null;
  }
}
