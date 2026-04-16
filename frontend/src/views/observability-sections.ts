import { createEmptyState } from "../components/empty-state";
import type {
  ObservabilityComponentSnapshot,
  ObservabilityHealthSurface,
  ObservabilitySessionRecord,
  ObservabilitySummary,
  ObservabilityTraceRecord,
  RuntimeSnapshot,
} from "../types";
import { statusDot } from "../ui/status-chip";
import { formatCompactNumber, formatDuration, formatRelativeTime, formatShortTime } from "../utils/format";

import {
  formatLatencyMs,
  meanHistogramMs,
  parsePrometheusText,
  sumMetric,
  type ParsedPrometheusMetrics,
} from "./observability-metrics";
import type { ObservabilityState } from "./observability-state";

interface RenderActions {
  onRefresh: () => void;
}

type HealthStatus = "ok" | "warn" | "error";

const TRACE_TAPE_LIMIT = 40;
const RECENT_EVENTS_LIMIT = 10;

export function renderObservabilitySections(
  container: HTMLElement,
  snapshot: RuntimeSnapshot | null,
  staleCount: number,
  state: ObservabilityState,
  actions: RenderActions,
): void {
  container.replaceChildren();
  const summary = state.summary;
  if (!snapshot && !summary) {
    container.append(
      createEmptyState(
        "Waiting for the first snapshot",
        "Observability will populate once the backend delivers its first state snapshot. This usually takes a few seconds.",
        "Refresh now",
        actions.onRefresh,
      ),
    );
    return;
  }
  const metrics = parsePrometheusText(state.metricsRaw);
  container.append(
    renderPulseBand(snapshot, summary, staleCount, state.refreshing),
    renderVitals(snapshot, metrics),
    renderSurfacesLedger(summary),
    renderComponentsLedger(summary),
    renderSessions(summary),
    renderTraceTape(summary),
    renderRecentEvents(snapshot),
  );
}

// ── Pulse band ────────────────────────────────────────────────────────────

function renderPulseBand(
  snapshot: RuntimeSnapshot | null,
  summary: ObservabilitySummary | null,
  staleCount: number,
  refreshing: boolean,
): HTMLElement {
  const band = document.createElement("section");
  band.className = "obs-pulse";
  band.setAttribute("aria-label", "System pulse");

  const verdict = document.createElement("div");
  verdict.className = "obs-pulse-verdict";
  const status = summary?.health.status ?? (snapshot ? "ok" : "warn");
  verdict.append(makeStatusDot(status));
  const label = document.createElement("strong");
  label.className = "obs-pulse-label";
  label.textContent = status.toUpperCase();
  verdict.append(label);
  const counts = document.createElement("span");
  counts.className = "obs-pulse-counts text-mono";
  if (summary) {
    const { ok, warn, error } = summary.health.counts;
    counts.textContent = `${ok} ok · ${warn} warn · ${error} error`;
  } else {
    counts.textContent = "awaiting first reading";
  }
  verdict.append(counts);

  const live = document.createElement("div");
  live.className = "obs-pulse-live";
  const generatedAt = summary?.generated_at ?? snapshot?.generated_at ?? null;
  const drifted = staleCount >= 3;
  const liveDot = document.createElement("span");
  liveDot.className = "obs-pulse-live-dot";
  if (drifted) {
    liveDot.classList.add("is-stale");
  }
  if (refreshing) {
    liveDot.classList.add("is-refreshing");
  }
  live.append(liveDot);
  const liveLabel = document.createElement("span");
  liveLabel.className = "obs-pulse-live-label text-mono";
  liveLabel.textContent = generatedAt ? `snapshot ${formatRelativeTime(generatedAt)}` : "snapshot pending";
  live.append(liveLabel);
  const liveTime = document.createElement("span");
  liveTime.className = "obs-pulse-live-time text-mono";
  liveTime.textContent = generatedAt ? formatShortTime(generatedAt) : "—";
  live.append(liveTime);
  if (drifted) {
    const drift = document.createElement("span");
    drift.className = "obs-pulse-drift text-mono";
    drift.textContent = `polling drift · ${staleCount} missed`;
    live.append(drift);
  }

  const root = document.createElement("div");
  root.className = "obs-pulse-root text-mono";
  root.textContent = summary?.snapshot_root ?? "snapshot root pending";
  root.title = summary?.snapshot_root ?? "";

  band.append(verdict, live, root);
  return band;
}

// ── Vitals row ────────────────────────────────────────────────────────────

function renderVitals(snapshot: RuntimeSnapshot | null, metrics: ParsedPrometheusMetrics): HTMLElement {
  const section = document.createElement("section");
  section.className = "obs-vitals";
  section.setAttribute("aria-label", "Vitals");

  const running = snapshot?.counts.running ?? 0;
  const retrying = snapshot?.counts.retrying ?? 0;
  const queued = snapshot?.queued.length ?? 0;
  const active = running + retrying;
  const totalTokens = snapshot?.codex_totals.total_tokens ?? 0;
  const seconds = snapshot?.codex_totals.seconds_running ?? 0;

  const httpTotal = sumMetric(metrics, "risoluto_http_requests_total") ?? 0;
  const http5xx = metrics.samples
    .filter((sample) => sample.name === "risoluto_http_requests_total" && sample.labels.status?.startsWith("5"))
    .reduce((total, sample) => total + sample.value, 0);
  const httpAvgMs = meanHistogramMs(metrics, "risoluto_http_request_duration_seconds");

  const polls = sumMetric(metrics, "risoluto_orchestrator_polls_total") ?? 0;
  const pollFails = sumMetric(metrics, "risoluto_orchestrator_polls_failed_total") ?? 0;

  section.append(
    makeVital(
      "active",
      "active workers",
      formatCompactNumber(active),
      `${running} running · ${retrying} retrying · ${queued} queued`,
    ),
    makeVital(
      "requests",
      "http requests",
      formatCompactNumber(httpTotal),
      `${formatCompactNumber(http5xx)} 5xx · ${formatLatencyMs(httpAvgMs)} mean`,
    ),
    makeVital(
      "polls",
      "orchestrator polls",
      formatCompactNumber(polls),
      `${formatCompactNumber(pollFails)} failures recorded`,
    ),
    makeVital("runtime", "codex runtime", formatCompactNumber(totalTokens), `tokens · ${formatDuration(seconds)}`),
  );
  return section;
}

function makeVital(key: string, label: string, value: string, detail: string): HTMLElement {
  const cell = document.createElement("div");
  cell.className = `obs-vital obs-vital-${key}`;
  const labelEl = document.createElement("span");
  labelEl.className = "obs-vital-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.className = "obs-vital-value";
  valueEl.textContent = value;
  const detailEl = document.createElement("span");
  detailEl.className = "obs-vital-detail";
  detailEl.textContent = detail;
  cell.append(labelEl, valueEl, detailEl);
  return cell;
}

// ── Surfaces ledger ───────────────────────────────────────────────────────

function renderSurfacesLedger(summary: ObservabilitySummary | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "obs-ledger obs-surfaces";
  section.append(
    makeLedgerHeader(
      "health surfaces",
      summary ? `${summary.health.surfaces.length} surfaces tracked` : "no surfaces reported",
    ),
  );
  if (!summary || summary.health.surfaces.length === 0) {
    section.append(makeEmptyRow("No health surfaces reported."));
    return section;
  }
  const rows = document.createElement("ol");
  rows.className = "obs-rows";
  [...summary.health.surfaces]
    .sort((a, b) => statusWeight(b.status) - statusWeight(a.status))
    .forEach((surface) => {
      rows.append(renderSurfaceRow(surface));
    });
  section.append(rows);
  return section;
}

function renderSurfaceRow(surface: ObservabilityHealthSurface): HTMLElement {
  const row = document.createElement("li");
  row.className = `obs-row obs-row-surface is-${surface.status}`;
  row.setAttribute("data-surface", surface.surface);

  row.append(makeStatusDot(surface.status));

  const name = document.createElement("span");
  name.className = "obs-col-name text-mono";
  name.textContent = surface.surface;
  row.append(name);

  const component = document.createElement("span");
  component.className = "obs-col-component text-mono";
  component.textContent = surface.component;
  row.append(component);

  const reason = document.createElement("span");
  reason.className = "obs-col-reason";
  reason.textContent = surface.reason ?? "—";
  row.append(reason);

  const when = document.createElement("span");
  when.className = "obs-col-when text-mono";
  when.textContent = formatRelativeTime(surface.updated_at);
  when.title = surface.updated_at;
  row.append(when);

  return row;
}

function statusWeight(status: string): number {
  if (status === "error") return 3;
  if (status === "warn") return 2;
  return 1;
}

// ── Components ledger ─────────────────────────────────────────────────────

function renderComponentsLedger(summary: ObservabilitySummary | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "obs-ledger obs-components";
  section.append(
    makeLedgerHeader("components", summary ? `${summary.components.length} reporting` : "no components reporting"),
  );
  if (!summary || summary.components.length === 0) {
    section.append(makeEmptyRow("No component snapshots received yet."));
    return section;
  }
  const rows = document.createElement("ol");
  rows.className = "obs-rows";
  summary.components.forEach((component) => {
    rows.append(renderComponentRow(component));
  });
  section.append(rows);
  return section;
}

function renderComponentRow(component: ObservabilityComponentSnapshot): HTMLElement {
  const row = document.createElement("li");
  row.className = "obs-row obs-row-component";
  const surfaceStatus = (Object.values(component.health)[0]?.status ?? "ok") as HealthStatus;
  row.append(makeStatusDot(surfaceStatus));

  const name = document.createElement("span");
  name.className = "obs-col-name text-mono";
  name.textContent = component.component;
  row.append(name);

  const pid = document.createElement("span");
  pid.className = "obs-col-pid text-mono";
  pid.textContent = `pid ${component.pid}`;
  row.append(pid);

  const metrics = document.createElement("span");
  metrics.className = "obs-col-metrics text-mono";
  const metricEntries = Object.entries(component.metrics);
  if (metricEntries.length === 0) {
    metrics.textContent = "no metrics";
  } else {
    metrics.textContent = metricEntries
      .map(([metricName, counter]) => `${counter.total} ${metricName} (${counter.success} ok · ${counter.failure} err)`)
      .join("    ");
  }
  row.append(metrics);

  const lastFailure = metricEntries.map(([, counter]) => counter.last_failure_reason).find((reason) => reason) ?? null;
  const reason = document.createElement("span");
  reason.className = "obs-col-reason";
  reason.textContent = lastFailure ? `last failure: ${lastFailure}` : "no recent failures";
  row.append(reason);

  const when = document.createElement("span");
  when.className = "obs-col-when text-mono";
  when.textContent = formatRelativeTime(component.updated_at);
  when.title = component.updated_at;
  row.append(when);

  return row;
}

// ── Sessions ──────────────────────────────────────────────────────────────

function renderSessions(summary: ObservabilitySummary | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "obs-ledger obs-sessions";
  const sessions = summary?.session_state ?? [];
  section.append(makeLedgerHeader("active sessions", `${sessions.length} connected`));
  if (sessions.length === 0) {
    section.append(makeEmptyRow("No active sessions."));
    return section;
  }
  const rows = document.createElement("ol");
  rows.className = "obs-rows";
  sessions.forEach((session) => {
    rows.append(renderSessionRow(session));
  });
  section.append(rows);
  return section;
}

function renderSessionRow(session: ObservabilitySessionRecord): HTMLElement {
  const row = document.createElement("li");
  row.className = "obs-row obs-row-session";
  row.append(makeStatusDot("ok"));

  const component = document.createElement("span");
  component.className = "obs-col-name text-mono";
  component.textContent = session.component;
  row.append(component);

  const key = document.createElement("span");
  key.className = "obs-col-key text-mono";
  key.textContent = session.key.slice(0, 8);
  key.title = session.key;
  row.append(key);

  const status = document.createElement("span");
  status.className = "obs-col-status text-mono";
  status.textContent = session.status;
  row.append(status);

  const path = document.createElement("span");
  path.className = "obs-col-reason text-mono";
  const metaPath = session.metadata && typeof session.metadata.path === "string" ? session.metadata.path : null;
  path.textContent = metaPath ?? "—";
  row.append(path);

  const when = document.createElement("span");
  when.className = "obs-col-when text-mono";
  when.textContent = formatRelativeTime(session.updated_at);
  when.title = session.updated_at;
  row.append(when);

  return row;
}

// ── Trace tape ────────────────────────────────────────────────────────────

function renderTraceTape(summary: ObservabilitySummary | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "obs-ledger obs-tape";
  const traces = summary?.traces ?? [];
  const shown = Math.min(TRACE_TAPE_LIMIT, traces.length);
  section.append(
    makeLedgerHeader(
      "trace tape",
      traces.length > 0 ? `${traces.length} traces received · showing latest ${shown}` : "waiting for first trace",
    ),
  );
  if (traces.length === 0) {
    section.append(makeEmptyRow("No traces observed yet."));
    return section;
  }

  const columnBar = document.createElement("div");
  columnBar.className = "obs-tape-cols";
  columnBar.setAttribute("aria-hidden", "true");
  const columns: Array<{ key: string; label: string }> = [
    { key: "when", label: "when" },
    { key: "component", label: "component" },
    { key: "operation", label: "operation" },
    { key: "outcome", label: "outcome" },
    { key: "duration", label: "duration" },
    { key: "payload", label: "payload" },
  ];
  columns.forEach(({ key, label }) => {
    const col = document.createElement("span");
    col.className = `obs-tape-col obs-tape-col-${key}`;
    col.textContent = label;
    columnBar.append(col);
  });
  section.append(columnBar);

  const tape = document.createElement("ol");
  tape.className = "obs-tape-rows";
  traces.slice(0, shown).forEach((trace) => {
    tape.append(renderTraceRow(trace));
  });
  section.append(tape);
  return section;
}

function renderTraceRow(trace: ObservabilityTraceRecord): HTMLElement {
  const row = document.createElement("li");
  row.className = `obs-tape-row is-${trace.outcome}`;
  row.title = `${trace.started_at} → ${trace.ended_at}`;

  const when = document.createElement("span");
  when.className = "obs-tape-col obs-tape-col-when text-mono";
  when.textContent = formatRelativeTime(trace.started_at);
  row.append(when);

  const component = document.createElement("span");
  component.className = "obs-tape-col obs-tape-col-component text-mono";
  component.textContent = trace.component;
  row.append(component);

  const operation = document.createElement("span");
  operation.className = "obs-tape-col obs-tape-col-operation text-mono";
  operation.textContent = trace.operation;
  row.append(operation);

  const outcome = document.createElement("span");
  outcome.className = "obs-tape-col obs-tape-col-outcome";
  outcome.append(makeStatusDot(trace.outcome === "success" ? "ok" : "error"));
  const outcomeLabel = document.createElement("span");
  outcomeLabel.className = "obs-tape-outcome-label text-mono";
  outcomeLabel.textContent = trace.outcome;
  outcome.append(outcomeLabel);
  row.append(outcome);

  const duration = document.createElement("span");
  duration.className = "obs-tape-col obs-tape-col-duration text-mono";
  duration.textContent = trace.duration_ms !== null ? formatLatencyMs(trace.duration_ms) : "—";
  row.append(duration);

  const payload = document.createElement("span");
  payload.className = "obs-tape-col obs-tape-col-payload text-mono";
  payload.textContent = formatTracePayload(trace);
  row.append(payload);

  return row;
}

function formatTracePayload(trace: ObservabilityTraceRecord): string {
  if (!trace.data) {
    return trace.reason ?? "—";
  }
  const data = trace.data;
  if (typeof data.method === "string" && typeof data.path === "string") {
    const status = typeof data.statusCode === "number" ? ` → ${data.statusCode}` : "";
    return `${data.method} ${data.path}${status}`;
  }
  if (typeof data.running === "number" || typeof data.queued === "number") {
    return `running=${String(data.running ?? "?")} queued=${String(data.queued ?? "?")}`;
  }
  if (typeof data.path === "string") {
    return data.path;
  }
  return Object.entries(data)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

// ── Recent events ─────────────────────────────────────────────────────────

function renderRecentEvents(snapshot: RuntimeSnapshot | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "obs-ledger obs-events";
  const events = snapshot?.recent_events ?? [];
  section.append(makeLedgerHeader("runtime events", `${events.length} in feed`));
  if (events.length === 0) {
    section.append(makeEmptyRow("No runtime events in the current snapshot."));
    return section;
  }
  const rows = document.createElement("ol");
  rows.className = "obs-rows";
  events.slice(0, RECENT_EVENTS_LIMIT).forEach((event) => {
    const row = document.createElement("li");
    row.className = "obs-row obs-row-event";
    const concerning = /retry|failed|timed out|stall|error/i.test(event.message);
    row.append(makeStatusDot(concerning ? "warn" : "ok"));

    const id = document.createElement("span");
    id.className = "obs-col-name text-mono";
    id.textContent = event.issue_identifier;
    row.append(id);

    const kind = document.createElement("span");
    kind.className = "obs-col-kind text-mono";
    kind.textContent = event.event;
    row.append(kind);

    const message = document.createElement("span");
    message.className = "obs-col-reason";
    message.textContent = event.message;
    row.append(message);

    const when = document.createElement("span");
    when.className = "obs-col-when text-mono";
    when.textContent = formatRelativeTime(event.at);
    when.title = event.at;
    row.append(when);

    rows.append(row);
  });
  section.append(rows);
  return section;
}

// ── Small helpers ─────────────────────────────────────────────────────────

function makeLedgerHeader(title: string, detail: string): HTMLElement {
  const header = document.createElement("header");
  header.className = "obs-ledger-header";
  const titleEl = document.createElement("h2");
  titleEl.className = "obs-ledger-title";
  titleEl.textContent = title;
  const detailEl = document.createElement("span");
  detailEl.className = "obs-ledger-detail text-mono";
  detailEl.textContent = detail;
  header.append(titleEl, detailEl);
  return header;
}

function makeEmptyRow(message: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "obs-empty";
  row.textContent = message;
  return row;
}

function makeStatusDot(status: HealthStatus | string): HTMLElement {
  return statusDot(String(status), "obs-dot");
}
