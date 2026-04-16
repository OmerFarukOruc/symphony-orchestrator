import { api } from "../api.js";
import { createEmptyState } from "../components/empty-state.js";
import { createPageHeader } from "../components/page-header.js";
import { router } from "../router.js";
import { getRuntimeClient } from "../state/runtime-client.js";
import { statusChip } from "../ui/status-chip.js";
import { skeletonLine } from "../ui/skeleton.js";
import type { WorkspaceInventoryEntry, WorkspaceInventoryResponse } from "../types/workspace.js";
import { flashDiff } from "../utils/diff.js";
import { el } from "../utils/dom.js";
import { registerPageCleanup } from "../utils/page.js";
import { formatBytes, formatRelativeTime } from "../utils/format.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusBadge(status: string): HTMLElement {
  return statusChip(status);
}

function toMcStatus(status: string): string {
  const map: Record<string, string> = {
    running: "is-status-running",
    retrying: "is-status-retrying",
    completed: "is-status-completed",
    orphaned: "is-status-blocked",
  };
  return map[status] ?? "";
}

/* ------------------------------------------------------------------ */
/*  Inventory summary strip                                            */
/* ------------------------------------------------------------------ */

function buildSummaryStrip(data: WorkspaceInventoryResponse): HTMLElement {
  const strip = el("section", "ws-summary-strip");
  const totalDisk = data.workspaces.reduce((sum, w) => sum + (w.disk_bytes ?? 0), 0);
  const items: Array<[string, string, "live" | "warning" | null]> = [
    ["Total", String(data.total), null],
    ["Active", String(data.active), data.active > 0 ? "live" : null],
    ["Orphaned", String(data.orphaned), data.orphaned > 0 ? "warning" : null],
    ["Disk", formatBytes(totalDisk), null],
  ];
  for (const [label, value, tone] of items) {
    const item = el("div", ["ws-summary-item", tone ? `is-${tone}` : ""].filter(Boolean).join(" "));
    item.append(el("span", "ws-summary-label", label), el("span", "ws-summary-value text-mono", value));
    strip.append(item);
  }
  return strip;
}

/* ------------------------------------------------------------------ */
/*  Workspace row                                                      */
/* ------------------------------------------------------------------ */

function buildWorkspaceRow(ws: WorkspaceInventoryEntry, index: number, onRemove: (key: string) => void): HTMLElement {
  const mcStatus = toMcStatus(ws.status);
  const row = el("div", `mc-strip ws-row ${mcStatus} stagger-item`);
  row.style.setProperty("--stagger-index", String(index));

  const key = el("div", "ws-row-key");
  key.append(el("span", "text-identifier", ws.workspace_key));
  row.append(key);

  const info = el("div", "ws-row-info");
  if (ws.issue) {
    const issueBtn = el("button", "ws-row-issue", ws.issue.title);
    issueBtn.type = "button";
    issueBtn.addEventListener("click", () => router.navigate(`/queue/${ws.issue!.identifier}`));
    info.append(issueBtn);
  } else {
    info.append(el("span", "ws-row-orphaned-label", "No linked issue"));
  }
  row.append(info);

  const meta = el("div", "ws-row-meta");
  meta.append(statusBadge(ws.status));
  if (ws.disk_bytes !== null) {
    const disk = el("span", "mc-badge is-sm");
    disk.textContent = formatBytes(ws.disk_bytes);
    meta.append(disk);
  }
  row.append(meta);

  const time = el("div", "ws-row-time", formatRelativeTime(ws.last_modified_at));
  row.append(time);

  if (ws.status === "orphaned" || ws.status === "completed") {
    const actions = el("div", "ws-row-actions");
    wireInlineRemoveConfirm(actions, ws.workspace_key, onRemove);
    row.append(actions);
  }

  return row;
}

/**
 * Inline confirm pattern: swaps a single "Remove" button for a
 * Confirm / Cancel pair inside the row so we avoid browser-native
 * confirm() dialogs, which break focus and don't theme.
 */
function wireInlineRemoveConfirm(container: HTMLElement, workspaceKey: string, onRemove: (key: string) => void): void {
  const removeBtn = el("button", "mc-button is-sm ws-row-remove", "Remove");
  removeBtn.type = "button";
  container.append(removeBtn);

  removeBtn.addEventListener("click", () => {
    container.replaceChildren();
    const prompt = el("span", "ws-row-confirm-prompt", "Confirm remove?");
    const confirmBtn = el("button", "mc-button is-sm ws-row-confirm", "Confirm");
    confirmBtn.type = "button";
    const cancelBtn = el("button", "mc-button is-sm is-ghost", "Cancel");
    cancelBtn.type = "button";
    confirmBtn.addEventListener("click", () => onRemove(workspaceKey));
    cancelBtn.addEventListener("click", () => {
      container.replaceChildren();
      wireInlineRemoveConfirm(container, workspaceKey, onRemove);
    });
    container.append(prompt, confirmBtn, cancelBtn);
    confirmBtn.focus();
  });
}

/* ------------------------------------------------------------------ */
/*  Section builders                                                   */
/* ------------------------------------------------------------------ */

function buildWorkspaceSection(data: WorkspaceInventoryResponse, onRemove: (key: string) => void): HTMLElement {
  const section = el("section", "ws-section");

  const header = el("div", "ws-section-header");
  const heading = el("h2", "ws-section-heading", "All workspaces");
  const count = el("span", "mc-badge is-sm is-status");
  count.textContent = String(data.total);
  header.append(heading, count);
  section.append(header);

  if (data.workspaces.length === 0) {
    section.append(
      el(
        "p",
        "ws-empty-hint",
        "No workspaces on disk yet. A workspace will appear here the first time an agent run clones a repository.",
      ),
    );
    return section;
  }

  const list = el("div", "ws-list");
  data.workspaces.forEach((ws, index) => {
    list.append(buildWorkspaceRow(ws, index, onRemove));
  });
  section.append(list);

  return section;
}

/* ------------------------------------------------------------------ */
/*  Render                                                             */
/* ------------------------------------------------------------------ */

function renderWorkspaces(page: HTMLElement, data: WorkspaceInventoryResponse, onRemove: (key: string) => void): void {
  const body = page.querySelector(".ws-page-body");
  if (!body) return;
  body.replaceChildren();

  body.append(buildSummaryStrip(data), buildWorkspaceSection(data, onRemove));
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function buildLoadingSkeleton(): HTMLElement {
  const shell = document.createElement("div");
  shell.setAttribute("aria-hidden", "true");

  const summary = el("div", "ws-summary-strip");
  Array.from({ length: 4 }).forEach(() => {
    const item = el("div", "ws-summary-item ws-summary-item--skeleton");
    item.append(skeletonLine("60%"), skeletonLine("40%"));
    summary.append(item);
  });
  shell.append(summary);

  const listWrap = el("div", "ws-section");
  const sectionHeader = el("div", "ws-section-header");
  sectionHeader.append(skeletonLine("140px"));
  listWrap.append(sectionHeader);

  const list = el("div", "ws-list");
  Array.from({ length: 5 }).forEach(() => {
    const row = el("div", "mc-strip ws-row ws-row--skeleton");
    row.append(skeletonLine("40%"), skeletonLine("55%"), skeletonLine("80px"), skeletonLine("60px"));
    list.append(row);
  });
  listWrap.append(list);
  shell.append(listWrap);

  return shell;
}

/* ------------------------------------------------------------------ */
/*  Page export                                                        */
/* ------------------------------------------------------------------ */

export function createWorkspacesPage(): HTMLElement {
  const runtimeClient = getRuntimeClient();
  const page = el("div", "page ws-page fade-in");

  const refreshBtn = el("button", "mc-button is-sm is-ghost", "Refresh (r)");
  refreshBtn.type = "button";
  refreshBtn.title = "Refresh workspace inventory (r)";

  const cleanStaleBtn = el("button", "mc-button is-sm", "Clean stale");
  cleanStaleBtn.type = "button";

  const header = createPageHeader(
    "Workspaces",
    "Monitor disk usage, inspect workspace state, and identify cleanup targets.",
    { actions: [refreshBtn, cleanStaleBtn] },
  );

  const body = el("section", "ws-page-body");
  body.append(buildLoadingSkeleton());

  page.append(header, body);

  let currentData: WorkspaceInventoryResponse | null = null;

  async function fetchAndRender(): Promise<void> {
    try {
      currentData = await api.getWorkspaces();
      renderWorkspaces(page, currentData, handleRemove);
    } catch {
      body.replaceChildren();
      body.append(
        createEmptyState(
          "Could not load workspaces",
          "Something went wrong fetching workspace data. Check the server logs for details, or try refreshing the page.",
          "Retry",
          () => void fetchAndRender(),
          "error",
        ),
      );
    }
  }

  async function handleRemove(workspaceKey: string): Promise<void> {
    // Inline confirm in the row wired by wireInlineRemoveConfirm — if we got
    // here the operator already explicitly confirmed.
    try {
      await api.removeWorkspace(workspaceKey);
      await fetchAndRender();
    } catch {
      await fetchAndRender();
    }
  }

  async function handleCleanStale(): Promise<void> {
    if (!currentData) return;
    const stale = currentData.workspaces.filter((ws) => ws.status === "orphaned" || ws.status === "completed");
    if (stale.length === 0) return;
    if (cleanStaleBtn.dataset.state !== "confirm") {
      const count = stale.length;
      cleanStaleBtn.textContent = `Confirm: remove ${count} stale`;
      cleanStaleBtn.dataset.state = "confirm";
      cleanStaleBtn.classList.add("is-confirming");
      setTimeout(() => {
        if (cleanStaleBtn.dataset.state === "confirm") {
          cleanStaleBtn.textContent = "Clean stale";
          cleanStaleBtn.dataset.state = "";
          cleanStaleBtn.classList.remove("is-confirming");
        }
      }, 4000);
      return;
    }
    cleanStaleBtn.textContent = "Clean stale";
    cleanStaleBtn.dataset.state = "";
    cleanStaleBtn.classList.remove("is-confirming");
    await Promise.allSettled(stale.map((ws) => api.removeWorkspace(ws.workspace_key)));
    await fetchAndRender();
  }

  cleanStaleBtn.addEventListener("click", () => void handleCleanStale());
  refreshBtn.addEventListener("click", () => void fetchAndRender());

  function handleKeydown(event: KeyboardEvent): void {
    const isTyping =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable);
    if (!isTyping && event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void fetchAndRender();
    }
  }
  globalThis.addEventListener("keydown", handleKeydown);

  void fetchAndRender();

  const onState = (): void => {
    if (currentData) void fetchAndRender();
  };
  const onWorkspaceEvent = (): void => {
    void fetchAndRender().then(() => flashDiff(body));
  };
  const unsubscribeState = runtimeClient.subscribeState(onState);
  const unsubscribeWorkspaceEvents = runtimeClient.subscribeWorkspaceEvents(onWorkspaceEvent);
  registerPageCleanup(page, () => {
    unsubscribeState();
    unsubscribeWorkspaceEvents();
  });

  return page;
}
