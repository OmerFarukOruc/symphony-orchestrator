import { createEmptyState } from "../../components/empty-state.js";
import { skeletonBlock } from "../../ui/skeleton.js";
import { createTableCell, createTableEmptyRow, createTableHead } from "../../ui/table.js";
import type { CodexThreadDetail, CodexThreadSummary } from "../../types/codex.js";
import { forkCodexThread, renameCodexThread, setCodexThreadArchived } from "./codex-admin-client.js";
import { createMetric, createPanel, createTag, formatUnixSeconds, runCodexAdminAction } from "./codex-admin-helpers.js";

function renderThreadDetail(thread: CodexThreadDetail | undefined, loading: boolean): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "codex-admin-thread-detail";
  if (loading) {
    wrap.append(skeletonBlock("120px"));
    return wrap;
  }
  if (!thread) {
    wrap.append(createEmptyState("Thread detail unavailable", "Open a thread to load its stored turns and metadata."));
    return wrap;
  }

  const metadata = document.createElement("div");
  metadata.className = "codex-admin-thread-metadata";
  metadata.append(
    createMetric("Thread ID", thread.id),
    createMetric("Source", thread.sourceKind || "\u2014"),
    createMetric("Workspace", thread.cwd || "\u2014"),
    createMetric("Turns", String(thread.turns?.length ?? 0)),
  );
  wrap.append(metadata);

  const turns = document.createElement("div");
  turns.className = "codex-admin-request-list";
  if (!thread.turns || thread.turns.length === 0) {
    turns.append(createEmptyState("No stored turns", "This thread did not return any stored turns."));
  } else {
    for (const turn of thread.turns.slice(0, 6)) {
      const item = document.createElement("div");
      item.className = "codex-admin-request";
      const title = document.createElement("strong");
      title.textContent = turn.id || "Turn";
      const meta = document.createElement("p");
      meta.className = "text-secondary";
      meta.textContent = `${turn.status || "unknown"} • ${turn.items?.length ?? 0} items${
        turn.error?.message ? ` • ${turn.error.message}` : ""
      }`;
      item.append(title, meta);
      turns.append(item);
    }
  }
  wrap.append(turns);
  return wrap;
}

function createThreadTitleCell(thread: CodexThreadSummary, isLoaded: boolean): HTMLTableCellElement {
  const title = document.createElement("div");
  title.className = "codex-admin-thread-title";
  const titleText = document.createElement("span");
  titleText.className = "codex-admin-thread-title-text";
  titleText.textContent = thread.name || thread.preview || thread.id;
  title.append(titleText, isLoaded ? createTag("Loaded", "success") : createTag("Stored"));
  const threadCell = document.createElement("td");
  threadCell.append(title);
  if (thread.preview && thread.preview !== thread.name) {
    const preview = document.createElement("div");
    preview.className = "codex-admin-thread-preview";
    preview.textContent = thread.preview;
    threadCell.append(preview);
  }
  return threadCell;
}

function createThreadActionButton(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button is-ghost";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function createThreadActionsCell(
  thread: CodexThreadSummary,
  isLoaded: boolean,
  expandedThreadId: string | null,
  onToggleThreadDetails: (threadId: string) => Promise<void>,
  onUnsubscribeThread: (threadId: string) => Promise<void>,
  onRefresh: () => Promise<void>,
): HTMLTableCellElement {
  const actionCell = document.createElement("td");
  actionCell.className = "codex-admin-actions";
  actionCell.append(
    createThreadActionButton("Rename", () => {
      const nextName = globalThis.prompt?.("Rename thread", thread.name ?? thread.preview ?? "");
      if (nextName === null || nextName === undefined) return;
      void runCodexAdminAction(
        () => renameCodexThread(thread.id, nextName),
        "Thread renamed.",
        "Failed to rename thread.",
        onRefresh,
      );
    }),
    createThreadActionButton("Fork", () => {
      void runCodexAdminAction(() => forkCodexThread(thread.id), "Thread forked.", "Failed to fork thread.", onRefresh);
    }),
    createThreadActionButton(expandedThreadId === thread.id ? "Hide details" : "Details", () => {
      void onToggleThreadDetails(thread.id);
    }),
    createThreadActionButton(
      "Unload",
      () => {
        void onUnsubscribeThread(thread.id);
      },
      !isLoaded,
    ),
    createThreadActionButton(thread.archived ? "Unarchive" : "Archive", () => {
      void runCodexAdminAction(
        () => setCodexThreadArchived(thread.id, !thread.archived),
        thread.archived ? "Thread restored." : "Thread archived.",
        thread.archived ? "Failed to restore thread." : "Failed to archive thread.",
        onRefresh,
      );
    }),
  );
  return actionCell;
}

function createThreadRows(
  thread: CodexThreadSummary,
  loadedThreadIds: Set<string>,
  expandedThreadId: string | null,
  threadDetail: CodexThreadDetail | undefined,
  loadingThreadId: string | null,
  onToggleThreadDetails: (threadId: string) => Promise<void>,
  onUnsubscribeThread: (threadId: string) => Promise<void>,
  onRefresh: () => Promise<void>,
): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = [];
  const isLoaded = loadedThreadIds.has(thread.id);
  const row = document.createElement("tr");
  row.append(
    createThreadTitleCell(thread, isLoaded),
    createTableCell(thread.modelProvider || "\u2014"),
    createTableCell(thread.status?.type || "\u2014"),
    createTableCell(formatUnixSeconds(thread.updatedAt ?? thread.createdAt)),
    createThreadActionsCell(thread, isLoaded, expandedThreadId, onToggleThreadDetails, onUnsubscribeThread, onRefresh),
  );
  rows.push(row);

  if (expandedThreadId === thread.id) {
    const detailRow = document.createElement("tr");
    const detailCell = document.createElement("td");
    detailCell.colSpan = 5;
    detailCell.append(renderThreadDetail(threadDetail, loadingThreadId === thread.id));
    detailRow.append(detailCell);
    rows.push(detailRow);
  }

  return rows;
}

export function renderThreadsPanel(
  threads: CodexThreadSummary[],
  loadedThreadIds: Set<string>,
  expandedThreadId: string | null,
  threadDetail: CodexThreadDetail | undefined,
  loadingThreadId: string | null,
  onToggleThreadDetails: (threadId: string) => Promise<void>,
  onUnsubscribeThread: (threadId: string) => Promise<void>,
  onRefresh: () => Promise<void>,
): HTMLElement {
  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "mc-button is-ghost";
  refreshButton.textContent = "Refresh";
  refreshButton.addEventListener("click", () => {
    void onRefresh();
  });
  const panel = createPanel(
    "Threads",
    "History from the host-side control plane. Loaded badges come from the in-memory thread list.",
    [refreshButton],
  );
  const tableWrap = document.createElement("div");
  tableWrap.className = "codex-admin-table-wrap";
  const table = document.createElement("table");
  table.className = "attempts-table codex-admin-table";
  table.append(createTableHead(["Thread", "Provider", "Status", "Updated", "Actions"]));
  const body = document.createElement("tbody");

  if (threads.length === 0) {
    body.append(createTableEmptyRow("No threads returned yet.", 5));
  } else {
    for (const thread of threads) {
      for (const row of createThreadRows(
        thread,
        loadedThreadIds,
        expandedThreadId,
        threadDetail,
        loadingThreadId,
        onToggleThreadDetails,
        onUnsubscribeThread,
        onRefresh,
      )) {
        body.append(row);
      }
    }
  }

  table.append(body);
  tableWrap.append(table);
  panel.append(tableWrap);
  return panel;
}
