import type { AuditRecord, AuditMutationEvent } from "../types";

export type { AuditRecord, AuditMutationEvent };

export interface AuditFilters {
  tableName: string;
  key: string;
  from: string;
  to: string;
}

export interface AuditState {
  entries: AuditRecord[];
  total: number;
  page: number;
  pageSize: number;
  filters: AuditFilters;
  expandedRows: Set<number>;
  liveCount: number;
  loading: boolean;
  error: string | null;
}

export function createAuditState(): AuditState {
  return {
    entries: [],
    total: 0,
    page: 0,
    pageSize: 50,
    filters: { tableName: "", key: "", from: "", to: "" },
    expandedRows: new Set(),
    liveCount: 0,
    loading: false,
    error: null,
  };
}

export function matchesFilters(event: AuditMutationEvent, filters: AuditFilters): boolean {
  if (filters.tableName && event.tableName !== filters.tableName) return false;
  if (filters.key && event.key !== filters.key) return false;
  if (filters.from && event.timestamp < filters.from) return false;
  // Date-only "to" values need end-of-day so same-day events are included
  const toLimit = filters.to && !filters.to.includes("T") ? filters.to + "T23:59:59.999Z" : filters.to;
  if (toLimit && event.timestamp > toLimit) return false;
  return true;
}
