/**
 * Shared type definitions for the audit subsystem.
 *
 * Both the port interface (port.ts) and the concrete logger implementation
 * (logger.ts) depend on these types, so they live here to avoid a circular
 * dependency between those two modules.
 */

export interface AuditEntry {
  tableName: string;
  key: string;
  path?: string | null;
  operation: string;
  previousValue?: string | null;
  newValue?: string | null;
  actor?: string;
  requestId?: string | null;
}

export interface AuditRecord {
  id: number;
  tableName: string;
  key: string;
  path: string | null;
  operation: string;
  previousValue: string | null;
  newValue: string | null;
  actor: string;
  requestId: string | null;
  timestamp: string;
}

export interface AuditQueryOptions {
  tableName?: string;
  key?: string;
  pathPrefix?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}
