/**
 * AuditLoggerPort — minimal interface for recording config, secret, and template mutations.
 *
 * Consumers depend on this interface rather than the concrete AuditLogger
 * so that test doubles can be injected without pulling in the SQLite
 * implementation.
 */

import type { AuditEntry, AuditRecord, AuditQueryOptions } from "./types.js";

export interface AuditLoggerPort {
  /** Record an arbitrary mutation entry in the audit log. */
  log(entry: AuditEntry): void;

  /** Convenience wrapper for config key mutations. */
  logConfigChange(key: string, previousValue: string | null, newValue: string | null, path?: string): void;

  /** Convenience wrapper for secret set/delete operations (values are always redacted). */
  logSecretChange(key: string, operation: "set" | "delete"): void;

  /** Convenience wrapper for prompt template create/update/delete operations. */
  logTemplateChange(
    templateId: string,
    operation: "create" | "update" | "delete",
    previousBody?: string | null,
    newBody?: string | null,
  ): void;

  /** Query audit records with optional filters and pagination. */
  query(options?: AuditQueryOptions): AuditRecord[];

  /** Count audit records matching the given filters. */
  count(options?: AuditQueryOptions): number;
}
