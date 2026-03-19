import type { RuntimeSnapshot } from "../types";

import { formatCompactNumber } from "../utils/format";
import { getMissingFamilies, summarizeMetrics, sumMetric, type ParsedPrometheusMetrics } from "./observability-metrics";
import type { ObservabilityTrendPoint } from "./observability-state";

export interface AnomalySummary {
  spikes: string[];
  failures: string[];
  stale: string[];
  instrumentation: string[];
}

export function buildAnomalySummary(
  snapshot: RuntimeSnapshot | null,
  trends: ObservabilityTrendPoint[],
  metrics: ParsedPrometheusMetrics,
  staleCount: number,
): AnomalySummary {
  const last = trends[trends.length - 1];
  const previous = trends[trends.length - 2];
  const tokenDelta = last && previous ? last.totalTokens - previous.totalTokens : 0;
  const queueDelta = last && previous ? last.queueDepth - previous.queueDepth : 0;
  const spikes = [
    tokenDelta > averageDelta(trends.map((point) => point.totalTokens)) * 1.8 && tokenDelta > 500
      ? `Token burn jumped by ${formatCompactNumber(tokenDelta)} since the last snapshot.`
      : "",
    queueDelta >= 3 ? `Queue pressure increased by ${queueDelta} issues in the latest snapshot.` : "",
  ].filter(Boolean);
  const failureTotal =
    sumMetric(metrics, "symphony_agent_runs_total", { outcome: "failed" }) ??
    sumMetric(metrics, "symphony_agent_runs_total", { status: "failed" }) ??
    0;
  const retrySignals =
    snapshot?.recent_events.filter((event) => /retry|failed|timed out|stalled/i.test(event.message)).length ?? 0;
  const failures =
    failureTotal >= 3 || retrySignals >= 3
      ? [
          `${formatCompactNumber(failureTotal)} backend failures recorded.`,
          retrySignals ? `${retrySignals} recent event log entries mention retry or failure pressure.` : "",
        ].filter(Boolean)
      : [];
  const staleAgeMs = snapshot ? Date.now() - new Date(snapshot.generated_at).getTime() : 0;
  const stale =
    staleCount >= 3 || staleAgeMs > 45_000
      ? [
          staleCount >= 3 ? `Frontend polling missed ${staleCount} consecutive updates.` : "",
          staleAgeMs > 45_000 ? `Latest backend snapshot is ${Math.round(staleAgeMs / 1000)}s old.` : "",
        ].filter(Boolean)
      : [];
  const instrumentation = buildInstrumentationWarnings(metrics);
  return { spikes, failures, stale, instrumentation };
}

function buildInstrumentationWarnings(metrics: ParsedPrometheusMetrics): string[] {
  const missing = getMissingFamilies(metrics);
  if (missing.length) {
    return missing.map((name) => `${humanizeMetric(name)} instrumentation not yet present.`);
  }
  const summary = summarizeMetrics(metrics);
  if (summary.includes("sparse") || summary.includes("zeroed")) {
    return [summary];
  }
  return [];
}

function averageDelta(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const deltas = values.slice(1).map((value, index) => Math.max(0, value - values[index]));
  return deltas.reduce((total, value) => total + value, 0) / deltas.length;
}

function humanizeMetric(name: string): string {
  return name
    .replace(/^symphony_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
