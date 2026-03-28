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

export interface AuditMutationEvent {
  tableName: string;
  key: string;
  path: string | null;
  operation: string;
  actor: string;
  timestamp: string;
}

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
  if (filters.key && !event.key.includes(filters.key)) return false;
  return true;
}
