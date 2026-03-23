import { api } from "../api";
import { createEmptyState } from "../components/empty-state";
import { createPageHeader } from "../components/page-header";
import { router } from "../router";
import type { WorkspaceInventoryEntry, WorkspaceInventoryResponse } from "../types";
import { registerPageCleanup } from "../utils/page";
import { formatBytes, formatRelativeTime } from "../utils/format";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function badge(text: string, variant: string): HTMLSpanElement {
  return el("span", `ws-badge ws-badge--${variant}`, text);
}

function statusDot(status: string): HTMLSpanElement {
  return el("span", `ws-status-dot ws-status-dot--${status}`);
}

/* ------------------------------------------------------------------ */
/*  Stat cards                                                         */
/* ------------------------------------------------------------------ */

function buildStatCard(label: string, value: string | number, accent?: string): HTMLElement {
  const card = el("div", "ws-stat-card");
  const val = el("span", "ws-stat-value", String(value));
  if (accent) val.classList.add(`ws-stat-value--${accent}`);
  card.append(val, el("span", "ws-stat-label", label));
  return card;
}

function buildStatsRow(data: WorkspaceInventoryResponse): HTMLElement {
  const row = el("div", "ws-stats-row");
  row.append(
    buildStatCard("Total", data.total),
    buildStatCard("Active", data.active, data.active > 0 ? "active" : undefined),
    buildStatCard("Orphaned", data.orphaned, data.orphaned > 0 ? "warning" : undefined),
    buildStatCard("Disk", formatBytes(data.workspaces.reduce((sum, w) => sum + (w.disk_bytes ?? 0), 0))),
  );
  return row;
}

/* ------------------------------------------------------------------ */
/*  Workspace row                                                      */
/* ------------------------------------------------------------------ */

function statusVariant(status: string): string {
  switch (status) {
    case "running":
      return "active";
    case "retrying":
      return "warning";
    case "completed":
      return "muted";
    case "orphaned":
      return "danger";
    default:
      return "muted";
  }
}

function buildWorkspaceRow(ws: WorkspaceInventoryEntry, onRemove: (key: string) => void): HTMLElement {
  const row = el("div", "ws-row");

  const key = el("div", "ws-row-key");
  key.append(statusDot(ws.status), el("span", "text-mono", ws.workspace_key));
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
  meta.append(badge(ws.status, statusVariant(ws.status)));
  if (ws.disk_bytes !== null) {
    meta.append(badge(formatBytes(ws.disk_bytes), "muted"));
  }
  row.append(meta);

  const time = el("div", "ws-row-time", formatRelativeTime(ws.last_modified_at));
  row.append(time);

  if (ws.status === "orphaned" || ws.status === "completed") {
    const actions = el("div", "ws-row-actions");
    const removeBtn = el("button", "ws-row-remove", "Remove");
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
  header.append(el("h2", "ws-section-title", "Workspaces"));
  header.append(badge(String(data.total), "accent"));
  section.append(header);

  if (data.workspaces.length === 0) {
    section.append(
      el("p", "ws-empty-hint", "No workspaces on disk. Workspaces appear after an agent run creates one."),
    );
    return section;
  }

  const list = el("div", "ws-list");
  for (const ws of data.workspaces) {
    list.append(buildWorkspaceRow(ws, onRemove));
  }
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
/*  Page export                                                        */
/* ------------------------------------------------------------------ */

export function createWorkspacesPage(): HTMLElement {
  const page = el("div", "page ws-page fade-in");

  const header = createPageHeader(
    "Workspaces",
    "Monitor disk usage, inspect workspace state, and identify cleanup targets.",
  );

  const body = el("section", "ws-page-body");
  const loading = el("div", "ws-loading");
  loading.append(el("p", "ws-empty-hint", "Loading workspace inventory…"));
  body.append(loading);

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
  window.addEventListener("state:update", handler);
  registerPageCleanup(page, () => window.removeEventListener("state:update", handler));

  return page;
}
