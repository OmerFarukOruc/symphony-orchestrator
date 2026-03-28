import { describe, expect, it } from "vitest";

// Inline types
interface AuditMutationEvent {
  tableName: string;
  key: string;
  path: string | null;
  operation: string;
  actor: string;
  timestamp: string;
}

interface AuditFilters {
  tableName: string;
  key: string;
  from: string;
  to: string;
}

interface AuditState {
  entries: unknown[];
  total: number;
  page: number;
  pageSize: number;
  filters: AuditFilters;
  expandedRows: Set<number>;
  liveCount: number;
  loading: boolean;
  error: string | null;
}

function createAuditState(): AuditState {
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

function matchesFilters(event: AuditMutationEvent, filters: AuditFilters): boolean {
  if (filters.tableName && event.tableName !== filters.tableName) return false;
  if (filters.key && !event.key.includes(filters.key)) return false;
  return true;
}

describe("AuditState", () => {
  it("creates default state with empty values", () => {
    const state = createAuditState();
    expect(state.entries).toEqual([]);
    expect(state.total).toBe(0);
    expect(state.page).toBe(0);
    expect(state.pageSize).toBe(50);
    expect(state.liveCount).toBe(0);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("creates default filters", () => {
    const state = createAuditState();
    expect(state.filters).toEqual({
      tableName: "",
      key: "",
      from: "",
      to: "",
    });
  });

  it("tracks expanded rows with Set", () => {
    const state = createAuditState();
    state.expandedRows.add(1);
    state.expandedRows.add(5);
    expect(state.expandedRows.has(1)).toBe(true);
    expect(state.expandedRows.has(5)).toBe(true);
    expect(state.expandedRows.has(3)).toBe(false);
    state.expandedRows.delete(1);
    expect(state.expandedRows.has(1)).toBe(false);
  });

  it("increments live count", () => {
    const state = createAuditState();
    state.liveCount++;
    state.liveCount++;
    expect(state.liveCount).toBe(2);
  });
});

describe("matchesFilters", () => {
  const baseEvent: AuditMutationEvent = {
    tableName: "config",
    key: "codex.model",
    path: null,
    operation: "update",
    actor: "dashboard",
    timestamp: "2026-03-28T12:00:00Z",
  };

  it("matches when no filters are set", () => {
    expect(matchesFilters(baseEvent, { tableName: "", key: "", from: "", to: "" })).toBe(true);
  });

  it("matches when tableName filter matches", () => {
    expect(
      matchesFilters(baseEvent, {
        tableName: "config",
        key: "",
        from: "",
        to: "",
      }),
    ).toBe(true);
  });

  it("rejects when tableName filter does not match", () => {
    expect(
      matchesFilters(baseEvent, {
        tableName: "secrets",
        key: "",
        from: "",
        to: "",
      }),
    ).toBe(false);
  });

  it("matches when key filter is a substring", () => {
    expect(
      matchesFilters(baseEvent, {
        tableName: "",
        key: "codex",
        from: "",
        to: "",
      }),
    ).toBe(true);
  });

  it("rejects when key filter is not found", () => {
    expect(
      matchesFilters(baseEvent, {
        tableName: "",
        key: "tracker",
        from: "",
        to: "",
      }),
    ).toBe(false);
  });

  it("applies both tableName and key filters", () => {
    expect(
      matchesFilters(baseEvent, {
        tableName: "config",
        key: "codex",
        from: "",
        to: "",
      }),
    ).toBe(true);
    expect(
      matchesFilters(baseEvent, {
        tableName: "secrets",
        key: "codex",
        from: "",
        to: "",
      }),
    ).toBe(false);
  });
});
