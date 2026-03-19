import { api } from "../api";
import { createEmptyState } from "../components/empty-state";

export function buildContainersPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "containers-page page fade-in";

  const heading = document.createElement("h1");
  heading.className = "page-title";
  heading.textContent = "Containers";

  const subtitle = document.createElement("p");
  subtitle.className = "page-subtitle";
  subtitle.textContent = "Monitor sandboxed agent containers — health, resource usage, and lifecycle events.";

  const content = document.createElement("div");
  page.append(heading, subtitle, content);
  loadContainers(content);
  return page;
}

async function loadContainers(container: HTMLElement): Promise<void> {
  try {
    const data = await api.getContainers();
    container.append(buildSummary(data.summary));
    if (data.containers.length === 0) {
      container.append(createEmptyState("No containers", "Containers are provisioned when sandbox mode is enabled."));
      return;
    }
    container.append(buildGrid(data.containers));
  } catch {
    container.append(createEmptyState("No containers", "Containers are provisioned when sandbox mode is enabled."));
  }
}

function buildSummary(summary: { running: number; stopped: number; errored: number; avg_cpu: string }): HTMLElement {
  const row = document.createElement("div");
  row.className = "containers-summary";

  const stats = [
    { label: "Running", value: summary.running, color: "var(--status-running)" },
    { label: "Stopped", value: summary.stopped, color: "var(--text-muted)" },
    { label: "Errored", value: summary.errored, color: "var(--status-blocked)" },
    { label: "Avg CPU", value: summary.avg_cpu },
  ];

  for (const stat of stats) {
    const box = document.createElement("div");
    box.className = "containers-stat";
    box.innerHTML = `<strong>${stat.value}</strong><span>${stat.label}</span>`;
    row.append(box);
  }
  return row;
}

interface Container {
  id: string;
  name: string;
  status: string;
  issue?: string;
  cpu_percent: number;
  memory_used: string;
  memory_limit: string;
  uptime: string;
}

function buildGrid(containers: Container[]): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "containers-grid";

  for (const ctr of containers) {
    grid.append(buildCard(ctr));
  }
  return grid;
}

function buildCard(ctr: Container): HTMLElement {
  const card = document.createElement("div");
  card.className = "container-card";

  const cpuLevel = ctr.cpu_percent > 80 ? "is-danger" : ctr.cpu_percent > 50 ? "is-warning" : "";
  const statusClass = ctr.status.toLowerCase();

  card.innerHTML = `
    <div class="container-card-header">
      <span class="container-name">${escapeHtml(ctr.name)}</span>
      <span class="status-chip status-${statusClass}"><span class="status-chip-dot">●</span> ${ctr.status}</span>
    </div>
    ${ctr.issue ? `<span class="issue-card-identifier">${escapeHtml(ctr.issue)}</span>` : ""}
    <div class="container-gauges">
      <div class="container-gauge">
        <div class="container-gauge-label"><span>CPU</span><span>${ctr.cpu_percent}%</span></div>
        <div class="container-gauge-bar"><div class="container-gauge-fill ${cpuLevel}" style="width:${ctr.cpu_percent}%"></div></div>
      </div>
      <div class="container-gauge">
        <div class="container-gauge-label"><span>Memory</span><span>${ctr.memory_used} / ${ctr.memory_limit}</span></div>
        <div class="container-gauge-bar"><div class="container-gauge-fill" style="width:50%"></div></div>
      </div>
    </div>
    <div class="container-uptime">${ctr.uptime}</div>
    <div class="container-actions">
      <button class="container-action-button">View logs</button>
      <button class="container-action-button">Restart</button>
      ${ctr.status.toLowerCase() === "running" ? `<button class="container-action-button is-danger">Stop</button>` : ""}
    </div>
  `;
  return card;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
