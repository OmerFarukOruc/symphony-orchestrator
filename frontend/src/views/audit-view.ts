import { api } from "../api";
import { createPageHeader } from "../components/page-header";
import { createButton } from "../components/forms";
import { toast } from "../ui/toast";
import { formatRelativeTime } from "../utils/format";
import { registerPageCleanup } from "../utils/page";

import {
  createAuditState,
  matchesFilters,
  type AuditMutationEvent,
  type AuditRecord,
  type AuditState,
} from "./audit-state";

function totalPages(state: AuditState): number {
  return Math.max(1, Math.ceil(state.total / state.pageSize));
}

function operationClass(operation: string): string {
  const normalized = operation.toLowerCase();
  if (normalized === "create") return "audit-op--create";
  if (normalized === "delete") return "audit-op--delete";
  if (normalized === "update" || normalized === "set") return `audit-op--${normalized}`;
  return "";
}

/** Append end-of-day to date-only "to" values so backend `<=` includes same-day events. */
function normalizeToDate(value: string): string {
  if (value && !value.includes("T")) return value + "T23:59:59.999Z";
  return value;
}

/* ── Data fetching ──────────────────────────────── */

async function fetchAuditLog(state: AuditState): Promise<{ entries: AuditRecord[]; total: number }> {
  return api.getAuditLog({
    tableName: state.filters.tableName || undefined,
    key: state.filters.key || undefined,
    from: state.filters.from || undefined,
    to: normalizeToDate(state.filters.to) || undefined,
    limit: state.pageSize,
    offset: state.page * state.pageSize,
  });
}

/* ── View ───────────────────────────────────────── */

export function createAuditPage(): HTMLElement {
  const state = createAuditState();
  const page = document.createElement("div");
  page.className = "page audit-page fade-in";

  /* ── Header ─────────────────────────────────── */
  const liveIndicator = document.createElement("span");
  liveIndicator.className = "audit-live-indicator";
  const liveDot = document.createElement("span");
  liveDot.className = "audit-live-dot";
  const liveLabel = document.createElement("span");
  liveLabel.textContent = "Live";
  liveIndicator.append(liveDot, liveLabel);

  const totalBadge = document.createElement("span");
  totalBadge.className = "mc-badge";
  totalBadge.textContent = "0 entries";

  const actions = document.createElement("div");
  actions.className = "mc-actions";
  actions.append(liveIndicator, totalBadge);

  const header = createPageHeader("Audit Log", "Configuration change history with real-time updates.", { actions });
  page.append(header);

  /* ── Filters ────────────────────────────────── */
  const filters = document.createElement("div");
  filters.className = "audit-filters";

  const tableSelect = document.createElement("select");
  tableSelect.setAttribute("aria-label", "Filter by table");
  for (const [label, value] of [
    ["All tables", ""],
    ["Config", "config"],
    ["Secrets", "secrets"],
    ["Templates", "prompt_templates"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    tableSelect.append(option);
  }

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = "Filter by key\u2026";
  keyInput.setAttribute("aria-label", "Filter by key");

  const fromInput = document.createElement("input");
  fromInput.type = "date";
  fromInput.setAttribute("aria-label", "From date");

  const toInput = document.createElement("input");
  toInput.type = "date";
  toInput.setAttribute("aria-label", "To date");

  const clearBtn = createButton("Clear");
  clearBtn.addEventListener("click", () => {
    tableSelect.value = "";
    keyInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    state.filters = { tableName: "", key: "", from: "", to: "" };
    resetAndFetch();
  });

  filters.append(tableSelect, keyInput, fromInput, toInput, clearBtn);
  page.append(filters);

  /* ── Table ──────────────────────────────────── */
  const table = document.createElement("table");
  table.className = "audit-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of ["Timestamp", "Table", "Key", "Operation", "Actor", ""]) {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.append(th);
  }
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  table.append(thead, tbody);
  page.append(table);

  /* ── Empty state ────────────────────────────── */
  const emptyEl = document.createElement("div");
  emptyEl.className = "audit-empty";
  emptyEl.textContent = "No audit entries found.";
  emptyEl.hidden = true;
  page.append(emptyEl);

  /* ── Pagination ─────────────────────────────── */
  const pagination = document.createElement("div");
  pagination.className = "audit-pagination";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Prev";
  prevBtn.disabled = true;
  prevBtn.addEventListener("click", () => {
    if (state.page > 0) {
      state.page--;
      load();
    }
  });

  const pageInfo = document.createElement("span");
  pageInfo.className = "audit-pagination-info";
  pageInfo.textContent = "Page 1 of 1";

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";
  nextBtn.disabled = true;
  nextBtn.addEventListener("click", () => {
    if (state.page < totalPages(state) - 1) {
      state.page++;
      load();
    }
  });

  pagination.append(prevBtn, pageInfo, nextBtn);
  page.append(pagination);

  /* ── Render helpers ─────────────────────────── */

  function renderTable(): void {
    tbody.replaceChildren();
    if (state.entries.length === 0) {
      emptyEl.hidden = false;
      table.hidden = true;
      pagination.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    table.hidden = false;
    pagination.hidden = false;

    for (const entry of state.entries) {
      const isLive = entry.id < 0;
      const row = document.createElement("tr");
      if (isLive) row.className = "audit-row--live";
      row.addEventListener("click", () => toggleDetail(entry));

      const tdTime = document.createElement("td");
      tdTime.textContent = formatRelativeTime(entry.timestamp);
      tdTime.title = entry.timestamp;

      const tdTable = document.createElement("td");
      tdTable.textContent = entry.tableName;

      const tdKey = document.createElement("td");
      tdKey.textContent = entry.key;

      const tdOp = document.createElement("td");
      const opBadge = document.createElement("span");
      opBadge.className = `audit-op ${operationClass(entry.operation)}`;
      opBadge.textContent = entry.operation;
      tdOp.append(opBadge);

      const tdActor = document.createElement("td");
      tdActor.textContent = entry.actor;

      const tdChevron = document.createElement("td");
      tdChevron.textContent = state.expandedRows.has(entry.id) ? "\u25BE" : "\u25B8";

      row.append(tdTime, tdTable, tdKey, tdOp, tdActor, tdChevron);
      tbody.append(row);

      if (state.expandedRows.has(entry.id)) {
        tbody.append(createDetailRow(entry));
      }
    }

    totalBadge.textContent = `${state.total} ${state.total === 1 ? "entry" : "entries"}`;
    prevBtn.disabled = state.page === 0;
    nextBtn.disabled = state.page >= totalPages(state) - 1;
    pageInfo.textContent = `Page ${state.page + 1} of ${totalPages(state)}`;
  }

  function createDetailRow(entry: AuditRecord): HTMLTableRowElement {
    const detailRow = document.createElement("tr");
    const detailTd = document.createElement("td");
    detailTd.colSpan = 6;
    detailTd.className = "audit-detail";

    const addField = (label: string, value: string | null): void => {
      if (value === null) return;
      const labelEl = document.createElement("div");
      labelEl.className = "audit-detail-label";
      labelEl.textContent = label;
      const pre = document.createElement("pre");
      pre.textContent = value;
      detailTd.append(labelEl, pre);
    };

    addField("Previous value", entry.previousValue);
    addField("New value", entry.newValue);
    addField("Request ID", entry.requestId);

    const tsLabel = document.createElement("div");
    tsLabel.className = "audit-detail-label";
    tsLabel.textContent = "Full timestamp";
    const tsValue = document.createElement("pre");
    tsValue.textContent = entry.timestamp;
    detailTd.append(tsLabel, tsValue);

    if (entry.path) {
      const pathLabel = document.createElement("div");
      pathLabel.className = "audit-detail-label";
      pathLabel.textContent = "Path";
      const pathValue = document.createElement("pre");
      pathValue.textContent = entry.path;
      detailTd.append(pathLabel, pathValue);
    }

    detailRow.append(detailTd);
    return detailRow;
  }

  function toggleDetail(entry: AuditRecord): void {
    if (state.expandedRows.has(entry.id)) {
      state.expandedRows.delete(entry.id);
    } else {
      state.expandedRows.add(entry.id);
    }
    renderTable();
  }

  /* ── Data loading ───────────────────────────── */

  async function load(): Promise<void> {
    state.loading = true;
    try {
      const result = await fetchAuditLog(state);
      state.entries = result.entries;
      state.total = result.total;
      state.error = null;
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to load audit log.";
      toast(state.error, "error");
    } finally {
      state.loading = false;
      renderTable();
    }
  }

  function resetAndFetch(): void {
    state.page = 0;
    state.liveCount = 0;
    state.expandedRows.clear();
    load();
  }

  /* ── Filter event handlers ──────────────────── */

  let keyDebounce: ReturnType<typeof setTimeout> | undefined;

  tableSelect.addEventListener("change", () => {
    state.filters.tableName = tableSelect.value;
    resetAndFetch();
  });

  keyInput.addEventListener("input", () => {
    clearTimeout(keyDebounce);
    keyDebounce = setTimeout(() => {
      state.filters.key = keyInput.value;
      resetAndFetch();
    }, 300);
  });

  fromInput.addEventListener("change", () => {
    state.filters.from = fromInput.value;
    resetAndFetch();
  });

  toInput.addEventListener("change", () => {
    state.filters.to = toInput.value;
    resetAndFetch();
  });

  /* ── SSE subscription ───────────────────────── */

  const onAuditMutation = (e: Event): void => {
    const detail = (e as CustomEvent).detail as AuditMutationEvent;
    if (state.page === 0 && matchesFilters(detail, state.filters)) {
      const liveEntry: AuditRecord = {
        id: -(state.liveCount + 1),
        tableName: detail.tableName,
        key: detail.key,
        path: detail.path,
        operation: detail.operation,
        previousValue: null,
        newValue: null,
        actor: detail.actor,
        requestId: null,
        timestamp: detail.timestamp,
      };
      state.entries.unshift(liveEntry);
      if (state.entries.length > state.pageSize) {
        state.entries.length = state.pageSize;
      }
      state.liveCount++;
      state.total++;
      renderTable();
    }
  };
  window.addEventListener("risoluto:audit-mutation", onAuditMutation);

  /* ── Cleanup ────────────────────────────────── */

  registerPageCleanup(page, () => {
    window.removeEventListener("risoluto:audit-mutation", onAuditMutation);
    clearTimeout(keyDebounce);
  });

  /* ── Initial load ───────────────────────────── */

  load();

  return page;
}
