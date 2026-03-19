import { api } from "../api";
import { createEmptyState } from "../components/empty-state";

export function buildWorkspacesPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "workspaces-page page fade-in";

  const heading = document.createElement("h1");
  heading.className = "page-title";
  heading.textContent = "Workspaces";

  const subtitle = document.createElement("p");
  subtitle.className = "page-subtitle";
  subtitle.textContent = "Manage agent workspaces — monitor disk usage, inspect workspace state, and trigger cleanup.";

  const content = document.createElement("div");
  page.append(heading, subtitle, content);
  loadWorkspaces(content);
  return page;
}

async function loadWorkspaces(container: HTMLElement): Promise<void> {
  try {
    const data = await api.getWorkspaces();
    container.append(buildSummary(data.summary));
    if (data.workspaces.length === 0) {
      container.append(
        createEmptyState(
          "No workspaces",
          "Workspaces are created automatically when the orchestrator processes issues.",
        ),
      );
      return;
    }
    container.append(buildTable(data.workspaces));
  } catch {
    container.append(
      createEmptyState("No workspaces", "Workspaces are created automatically when the orchestrator processes issues."),
    );
  }
}

function buildSummary(summary: { total: number; active: number; stale: number; disk_usage: string }): HTMLElement {
  const row = document.createElement("div");
  row.className = "workspaces-summary";

  const stats = [
    { label: "Total workspaces", value: summary.total },
    { label: "Active", value: summary.active, dot: "is-active" },
    { label: "Stale", value: summary.stale, dot: "is-stale" },
    { label: "Disk usage", value: summary.disk_usage },
  ];

  for (const stat of stats) {
    const box = document.createElement("div");
    box.className = "workspaces-stat";
    const dotHtml = stat.dot ? `<span class="workspace-status-dot ${stat.dot}"></span>` : "";
    box.innerHTML = `<strong>${dotHtml}${stat.value}</strong><span>${stat.label}</span>`;
    row.append(box);
  }
  return row;
}

function buildTable(
  workspaces: Array<{ key: string; issue: string; status: string; path: string; size: string; last_activity: string }>,
): HTMLElement {
  const table = document.createElement("table");
  table.className = "attempts-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Status</th>
        <th>Workspace key</th>
        <th>Issue</th>
        <th>Path</th>
        <th>Size</th>
        <th>Last activity</th>
      </tr>
    </thead>
    <tbody>
      ${workspaces
        .map(
          (ws) => `
        <tr>
          <td><span class="workspace-status-dot is-${ws.status.toLowerCase()}"></span></td>
          <td class="text-mono">${escapeHtml(ws.key)}</td>
          <td><span class="issue-card-identifier">${escapeHtml(ws.issue)}</span></td>
          <td class="text-mono workspace-path-tooltip" title="${escapeHtml(ws.path)}">${escapeHtml(ws.path)}</td>
          <td>${ws.size}</td>
          <td class="text-secondary">${ws.last_activity}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  `;
  return table;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
