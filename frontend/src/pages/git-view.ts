import { api } from "../api";
import { createEmptyState } from "../components/empty-state";

export function buildGitPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "git-page page fade-in";

  const heading = document.createElement("h1");
  heading.className = "page-title";
  heading.textContent = "Git & Pull Requests";

  const subtitle = document.createElement("p");
  subtitle.className = "page-subtitle";
  subtitle.textContent = "Track branches, pull requests, and git operations managed by the orchestrator.";

  const content = document.createElement("div");
  page.append(heading, subtitle, content);
  loadGitData(content);
  return page;
}

async function loadGitData(container: HTMLElement): Promise<void> {
  try {
    const data = await api.getGitPrs();
    container.append(buildSummaryStrip(data));
    if (data.pull_requests.length === 0) {
      container.append(
        createEmptyState(
          "No git activity",
          "Git operations and pull requests will appear here as issues are processed.",
        ),
      );
      return;
    }
    container.append(buildPrTable(data.pull_requests));
  } catch {
    container.append(
      createEmptyState("No git activity", "Git operations and pull requests will appear here as issues are processed."),
    );
  }
}

function buildSummaryStrip(data: {
  pull_requests: unknown[];
  summary: { active_branches: number; open_prs: number; merged_today: number; failed_ops: number };
}): HTMLElement {
  const strip = document.createElement("div");
  strip.className = "git-summary-strip";

  const stats = [
    { label: "Active branches", value: data.summary.active_branches },
    { label: "Open PRs", value: data.summary.open_prs },
    { label: "Merged today", value: data.summary.merged_today },
    { label: "Failed git ops", value: data.summary.failed_ops, alert: data.summary.failed_ops > 0 },
  ];

  for (const stat of stats) {
    const box = document.createElement("div");
    box.className = `git-stat-box${stat.alert ? " is-alert" : ""}`;
    box.innerHTML = `<strong>${stat.value}</strong><span>${stat.label}</span>`;
    strip.append(box);
  }
  return strip;
}

function buildPrTable(
  prs: Array<{
    issue: string;
    branch: string;
    title: string;
    pr_number: number;
    status: string;
    updated: string;
    url?: string;
  }>,
): HTMLElement {
  const table = document.createElement("table");
  table.className = "attempts-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Issue</th>
        <th>Branch</th>
        <th>PR</th>
        <th>Status</th>
        <th>Updated</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${prs
        .map(
          (pr) => `
        <tr>
          <td><span class="issue-card-identifier">${escapeHtml(pr.issue)}</span></td>
          <td class="text-mono">${escapeHtml(pr.branch)}</td>
          <td>${escapeHtml(pr.title)} <span class="text-secondary">#${pr.pr_number}</span></td>
          <td><span class="status-chip status-${pr.status.toLowerCase()}">${pr.status}</span></td>
          <td class="text-secondary">${pr.updated}</td>
          <td>${pr.url ? `<a href="${pr.url}" target="_blank" style="color:var(--color-copper-400)">View PR ↗</a>` : ""}</td>
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
