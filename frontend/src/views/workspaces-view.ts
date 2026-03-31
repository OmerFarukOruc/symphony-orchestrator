import { api } from "../api.js";
import { createEmptyState } from "../components/empty-state.js";
import { createPageHeader } from "../components/page-header.js";
import { router } from "../router.js";
import { statusChip } from "../ui/status-chip.js";
import { skeletonLine } from "../ui/skeleton.js";
import type { WorkspaceInventoryEntry, WorkspaceInventoryResponse } from "../types.js";
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
/*  Stat cards                                                         */
/* ------------------------------------------------------------------ */

function buildStatCard(label: string, value: string | number, accent?: string): HTMLElement {
  const card = el("div", "mc-stat-card" + (accent ? ` is-${accent}` : ""));
  const val = el("span", "heading-display", String(value));
  card.append(val, el("span", "mc-stat-card-label", label));
  return card;
}

function buildStatsRow(data: WorkspaceInventoryResponse): HTMLElement {
  const row = el("div", "ws-stats-row");
  row.append(
    buildStatCard("Total", data.total),
    buildStatCard("Active", data.active, data.active > 0 ? "live" : undefined),
    buildStatCard("Orphaned", data.orphaned, data.orphaned > 0 ? "warning" : undefined),
    buildStatCard("Disk", formatBytes(data.workspaces.reduce((sum, w) => sum + (w.disk_bytes ?? 0), 0))),
  );
  return row;
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
    const removeBtn = el("button", "mc-button is-sm ws-row-remove", "Remove");
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => onRemove(ws.workspace_key));
    actions.append(removeBtn);
    row.append(actions);
  }

  return row;
}

/* ------------------------------------------------------------------ */
/*  Section builders                                                   */
/* ------------------------------------------------------------------ */

function buildWorkspaceSection(data: WorkspaceInventoryResponse, onRemove: (key: string) => void): HTMLElement {
  const section = el("section", "ws-section");

  const header = el("div", "ws-section-header");
  header.append(el("h2", "heading-section", "Workspaces"));
  const count = el("span", "mc-badge is-sm is-status");
  count.textContent = String(data.total);
  header.append(count);
  section.append(header);

  if (data.workspaces.length === 0) {
    section.append(
      el("p", "ws-empty-hint", "No workspaces on disk. Workspaces appear after an agent run creates one."),
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
  body.innerHTML = "";

  body.append(buildStatsRow(data), buildWorkspaceSection(data, onRemove));
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function buildLoadingSkeleton(): HTMLElement {
  const shell = document.createElement("div");
  shell.setAttribute("aria-hidden", "true");

  const statsRow = el("div", "ws-stats-row");
  Array.from({ length: 4 }).forEach(() => {
    const card = el("div", "mc-stat-card");
    card.append(skeletonLine("60%"), skeletonLine("40%"));
    statsRow.append(card);
  });
  shell.append(statsRow);

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
  const page = el("div", "page ws-page fade-in");

  const header = createPageHeader(
    "Workspaces",
    "Monitor disk usage, inspect workspace state, and identify cleanup targets.",
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
      body.innerHTML = "";
      body.append(
        createEmptyState(
          "Failed to load workspace inventory",
          "The workspace inventory API returned an error. Check server logs or try refreshing.",
          "Retry",
          () => void fetchAndRender(),
          "error",
        ),
      );
    }
  }

  async function handleRemove(workspaceKey: string): Promise<void> {
    if (!confirm(`Remove workspace ${workspaceKey}? This deletes all workspace files.`)) return;
    try {
      await api.removeWorkspace(workspaceKey);
      await fetchAndRender();
    } catch {
      await fetchAndRender();
    }
  }

  void fetchAndRender();

  const handler = (): void => {
    if (currentData) void fetchAndRender();
  };
  const onWorkspaceEvent = (): void => {
    void fetchAndRender().then(() => flashDiff(body));
  };
  window.addEventListener("state:update", handler);
  window.addEventListener("risoluto:workspace-event", onWorkspaceEvent);
  registerPageCleanup(page, () => {
    window.removeEventListener("state:update", handler);
    window.removeEventListener("risoluto:workspace-event", onWorkspaceEvent);
  });

  return page;
}
