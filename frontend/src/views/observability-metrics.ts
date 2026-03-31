import type { RateLimits, RuntimeSnapshot } from "../types";

import { formatCompactNumber, formatDuration, formatRateLimitHeadroom, formatRelativeTime } from "../utils/format";
import type { ObservabilityTrendPoint } from "./observability-state";

export interface PrometheusSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export interface ParsedPrometheusMetrics {
  helps: Record<string, string>;
  types: Record<string, string>;
  samples: PrometheusSample[];
}

const REQUIRED_FAMILIES = [
  "risoluto_http_requests_total",
  "risoluto_http_request_duration_seconds",
  "risoluto_orchestrator_polls_total",
  "risoluto_agent_runs_total",
];

export function parsePrometheusText(raw: string): ParsedPrometheusMetrics {
  const helps: Record<string, string> = {};
  const types: Record<string, string> = {};
  const samples: PrometheusSample[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("# HELP ")) {
      const [, name, ...rest] = trimmed.split(" ");
      helps[name] = rest.join(" ");
      continue;
    }
    if (trimmed.startsWith("# TYPE ")) {
      const [, name, type] = trimmed.split(" ");
      types[name] = type;
      continue;
    }
    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
    if (!match) {
      continue;
    }
    const [, name, , rawLabels = "", rawValue] = match;
    samples.push({ name, labels: parseLabels(rawLabels), value: Number(rawValue) });
  }
  return { helps, types, samples };
}

export function sumMetric(
  metrics: ParsedPrometheusMetrics,
  name: string,
  matcher?: Record<string, string>,
): number | null {
  const samples = metrics.samples.filter((sample) => sample.name === name && matchesLabels(sample.labels, matcher));
  if (!samples.length) {
    return null;
  }
  return samples.reduce((total, sample) => total + sample.value, 0);
}

export function meanHistogramMs(metrics: ParsedPrometheusMetrics, baseName: string): number | null {
  const total = sumMetric(metrics, `${baseName}_sum`);
  const count = sumMetric(metrics, `${baseName}_count`);
  if (total === null || count === null || count <= 0) {
    return null;
  }
  return (total / count) * 1000;
}

export function summarizeMetrics(metrics: ParsedPrometheusMetrics): string {
  if (!metrics.samples.length) {
    return "No metric samples received yet";
  }
  const total = metrics.samples.length;
  const nonZero = metrics.samples.filter((sample) => sample.value !== 0).length;
  if (nonZero === 0) {
    return `Metrics endpoint is reachable but all ${total} samples are currently zeroed.`;
  }
  if (nonZero < Math.ceil(total / 4)) {
    return `Metrics are sparse right now (${nonZero}/${total} non-zero samples).`;
  }
  return `${nonZero}/${total} metric samples currently carry signal.`;
}

export function getMissingFamilies(metrics: ParsedPrometheusMetrics): string[] {
  return REQUIRED_FAMILIES.filter(
    (name) => !metrics.samples.some((sample) => sample.name === name || sample.name.startsWith(`${name}_`)),
  );
}

export function buildHttpHealthSummary(metrics: ParsedPrometheusMetrics): string {
  const total = sumMetric(metrics, "risoluto_http_requests_total");
  const errors = metrics.samples
    .filter((sample) => sample.name === "risoluto_http_requests_total" && sample.labels.status?.startsWith("5"))
    .reduce((count, sample) => count + sample.value, 0);
  const latency = meanHistogramMs(metrics, "risoluto_http_request_duration_seconds");
  if (total === null) {
    return "No HTTP traffic recorded yet";
  }
  return `${formatCompactNumber(total)} requests · ${formatCompactNumber(errors)} 5xx · ${formatLatency(latency)} avg`;
}

export function buildPollSummary(metrics: ParsedPrometheusMetrics, trends: ObservabilityTrendPoint[]): string {
  const polls = sumMetric(metrics, "risoluto_orchestrator_polls_total");
  const cadence = describeCadence(trends);
  const cadenceSuffix = cadence ? ` · ${cadence}` : "";
  if (polls === null) {
    return `No poll cycles recorded yet${cadenceSuffix}`;
  }
  return `${formatCompactNumber(polls)} poll cycles${cadenceSuffix}`;
}

export function buildRateLimitSummary(rateLimits: RateLimits | null): string {
  if (!rateLimits || typeof rateLimits !== "object") {
    return "Rate-limit data not available";
  }
  const record = rateLimits as Record<string, unknown>;
  const remaining = Number(record.remaining ?? 0);
  const limit = Number(record.limit ?? record.total ?? 0);
  const resetsAt = String(record.reset_at ?? record.resets_at ?? "");
  const resetSuffix = resetsAt ? ` · resets ${formatRelativeTime(resetsAt)}` : "";
  if (!limit) {
    return "Rate-limit data not available";
  }
  return `${formatCompactNumber(remaining)} of ${formatCompactNumber(limit)} remaining${resetSuffix}`;
}

export function formatCpuMemory(metrics: ParsedPrometheusMetrics): string {
  const cpu = sumMetric(metrics, "risoluto_container_cpu_percent");
  const memory = sumMetric(metrics, "risoluto_container_memory_percent");
  if (cpu === null && memory === null) {
    return "No active containers";
  }
  return `CPU ${formatPercent(cpu)} · Memory ${formatPercent(memory)}`;
}

export function formatHeadroom(rateLimits: RateLimits | null): string {
  const headroom = formatRateLimitHeadroom(rateLimits);
  return headroom === "N/A" ? "Rate-limit data not available" : headroom;
}

export function formatPollAge(snapshot: RuntimeSnapshot | null): string {
  if (!snapshot) {
    return "No backend snapshot yet";
  }
  const ageMs = Math.max(0, Date.now() - new Date(snapshot.generated_at).getTime());
  return `${Math.round(ageMs / 1000)}s old`;
}

export function formatFreshness(snapshot: RuntimeSnapshot | null): string {
  if (!snapshot) {
    return "Waiting for state updates";
  }
  return `${formatRelativeTime(snapshot.generated_at)} · ${snapshot.generated_at}`;
}

export function summarizeActiveCounts(snapshot: RuntimeSnapshot | null): string {
  if (!snapshot) {
    return "Waiting for current snapshot";
  }
  const active = snapshot.counts.running + snapshot.counts.retrying;
  return `${active} active · ${snapshot.counts.running} running · ${snapshot.counts.retrying} retrying · ${snapshot.queued.length} queued`;
}

export function summarizeRuntime(snapshot: RuntimeSnapshot | null): string {
  if (!snapshot) {
    return "Waiting for current snapshot";
  }
  return `${formatCompactNumber(snapshot.codex_totals.total_tokens)} total tokens · ${formatDuration(snapshot.codex_totals.seconds_running)}`;
}

export function describeCadence(trends: ObservabilityTrendPoint[]): string {
  const deltas = trends.slice(1).map((trend, index) => (trend.capturedAt - trends[index].capturedAt) / 1000);
  if (!deltas.length) {
    return "Client trend still warming up";
  }
  const average = deltas.reduce((total, value) => total + value, 0) / deltas.length;
  return `~${average.toFixed(1)}s between snapshots`;
}

function parseLabels(input: string): Record<string, string> {
  if (!input) {
    return {};
  }
  return Object.fromEntries(
    input
      .split(/,(?=[a-zA-Z_]\w*=)/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf("=");
        return [
          pair.slice(0, separator),
          pair
            .slice(separator + 1)
            .trim()
            .replaceAll(/^"|"$/g, ""),
        ];
      }),
  );
}

function matchesLabels(labels: Record<string, string>, matcher?: Record<string, string>): boolean {
  if (!matcher) {
    return true;
  }
  return Object.entries(matcher).every(([key, value]) => labels[key] === value);
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(1)}%`;
}

export function formatLatency(valueMs: number | null): string {
  if (valueMs === null || Number.isNaN(valueMs)) {
    return "No latency data yet";
  }
  if (valueMs >= 1000) {
    return `${(valueMs / 1000).toFixed(2)}s`;
  }
  return `${Math.round(valueMs)}ms`;
}
