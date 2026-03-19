import { createEmptyState } from "../components/empty-state";
import type { RuntimeSnapshot } from "../types";

import {
  buildHttpHealthSummary,
  buildPollSummary,
  buildRateLimitSummary,
  describeCadence,
  formatCpuMemory,
  formatFreshness,
  formatHeadroom,
  formatLatency,
  formatPollAge,
  getMissingFamilies,
  meanHistogramMs,
  parsePrometheusText,
  summarizeActiveCounts,
  summarizeMetrics,
  summarizeRuntime,
} from "./observability-metrics";
import { buildAnomalySummary } from "./observability-anomalies";
import { buildCadenceSeries, buildListCard, buildSection, type WidgetDescriptor } from "./observability-cards";
import type { ObservabilityState } from "./observability-state";

export function renderObservabilitySections(
  container: HTMLElement,
  snapshot: RuntimeSnapshot | null,
  staleCount: number,
  state: ObservabilityState,
): void {
  container.replaceChildren();
  const metrics = parsePrometheusText(state.metricsRaw);
  const summary = document.createElement("section");
  summary.className = "mc-strip observability-summary";
  summary.innerHTML = `<div><h2>Instrumentation status</h2><p class="text-secondary">${summarizeMetrics(metrics)}</p></div><span class="mc-badge">${getMissingFamilies(metrics).length ? "Fallback messaging active" : "Metrics connected"}</span>`;
  container.append(summary);
  if (!snapshot) {
    container.append(
      createEmptyState(
        "Waiting for backend state",
        "Observability cards will populate after the next /api/v1/state update arrives.",
      ),
    );
    return;
  }
  const sections = [
    buildSection("Service health", [
      {
        title: "Last poll freshness",
        source: "current snapshot",
        value: formatPollAge(snapshot),
        detail: formatFreshness(snapshot),
      },
      {
        title: "Active / running / retrying",
        source: "current snapshot",
        value: `${snapshot.counts.running + snapshot.counts.retrying}`,
        detail: summarizeActiveCounts(snapshot),
      },
      {
        title: "HTTP health summary",
        source: "backend counter",
        value: buildHttpHealthSummary(metrics),
        detail: "Prometheus counter and histogram output from /metrics.",
      },
      {
        title: "Poll health summary",
        source: "backend counter",
        value: buildPollSummary(metrics, state.trends),
        detail: summarizeRuntime(snapshot),
      },
    ]),
    buildSection("Operational trends", [
      {
        title: "Token trend",
        source: "client trend",
        value: summarizeRuntime(snapshot),
        detail: "In-session client trend across the last 20 polling snapshots.",
        sparkline: state.trends.map((point) => point.totalTokens),
      },
      {
        title: "Run outcomes",
        source: "client trend",
        value: `${state.trends[state.trends.length - 1]?.terminalCount ?? 0} terminal issues visible`,
        detail: "Terminal issue count visible in snapshot history.",
        sparkline: state.trends.map((point) => point.terminalCount),
      },
      {
        title: "Retry trend",
        source: "client trend",
        value: `${snapshot.counts.retrying} retrying now`,
        detail: "Retry pressure derived from snapshot counts.",
        sparkline: state.trends.map((point) => point.retrying),
      },
      {
        title: "Queue pressure",
        source: "client trend",
        value: `${snapshot.queued.length} queued now`,
        detail: describeCadence(state.trends),
        sparkline: state.trends.map((point) => point.queueDepth),
      },
    ]),
    buildSection("Rates and limits", [
      {
        title: "Rate-limit headroom",
        source: "current snapshot",
        value: formatHeadroom(snapshot.rate_limits),
        detail: buildRateLimitSummary(snapshot.rate_limits),
      },
      {
        title: "Request latency",
        source: "backend counter",
        value: formatLatency(meanHistogramMs(metrics, "symphony_http_request_duration_seconds")),
        detail: "Average latency from Prometheus histogram sum/count.",
      },
      {
        title: "Poll cadence",
        source: "client trend",
        value: describeCadence(state.trends),
        detail: "Measured from in-browser snapshot arrival times.",
        sparkline: buildCadenceSeries(state.trends.map((point) => point.capturedAt)),
      },
      {
        title: "Container CPU / memory",
        source: "backend counter",
        value: formatCpuMemory(metrics),
        detail: "Gauge metrics surfaced only when container stats are available.",
      },
    ]),
    buildSection("Anomalies", buildAnomalyCards(snapshot, staleCount, state, metrics)),
  ];
  container.append(...sections);
}

function buildAnomalyCards(
  snapshot: RuntimeSnapshot,
  staleCount: number,
  state: ObservabilityState,
  metrics: ReturnType<typeof parsePrometheusText>,
): WidgetDescriptor[] {
  const anomalies = buildAnomalySummary(snapshot, state.trends, metrics, staleCount);
  return [
    buildListCard("Recent spikes", anomalies.spikes, "client trend"),
    buildListCard("Repeated failures", anomalies.failures, "backend counter"),
    buildListCard("Stale polling warnings", anomalies.stale, "current snapshot"),
    buildListCard("Missing instrumentation warnings", anomalies.instrumentation, "backend counter"),
  ];
}
