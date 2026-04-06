type Labels = Record<string, string>;

export interface ObservabilityMetricCounter {
  total: number;
  success: number;
  failure: number;
  lastAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
}

export function recordMetricCounter(
  counter: ObservabilityMetricCounter | undefined,
  input: { outcome: "success" | "failure"; at?: string; reason?: string | null },
): ObservabilityMetricCounter {
  const next: ObservabilityMetricCounter = {
    total: counter?.total ?? 0,
    success: counter?.success ?? 0,
    failure: counter?.failure ?? 0,
    lastAt: counter?.lastAt,
    lastSuccessAt: counter?.lastSuccessAt,
    lastFailureAt: counter?.lastFailureAt,
    lastFailureReason: counter?.lastFailureReason,
  };
  const at = input.at ?? new Date().toISOString();
  next.total += 1;
  next.lastAt = at;
  if (input.outcome === "success") {
    next.success += 1;
    next.lastSuccessAt = at;
    return next;
  }
  next.failure += 1;
  next.lastFailureAt = at;
  if (input.reason) {
    next.lastFailureReason = input.reason;
  }
  return next;
}

function labelKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

/** Shared serializer for Counter and Gauge (same format, different TYPE string). */
function serializeKeyValue(name: string, help: string, typeName: string, values: Map<string, number>): string {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${typeName}`];
  if (values.size === 0) {
    lines.push(`${name} 0`);
  } else {
    for (const [key, value] of values) {
      const suffix = key ? `{${key}}` : "";
      lines.push(`${name}${suffix} ${value}`);
    }
  }
  return lines.join("\n");
}

class Counter {
  private readonly values = new Map<string, number>();

  increment(labels: Labels = {}): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + 1);
  }

  reset(): void {
    this.values.clear();
  }

  serialize(name: string, help: string): string {
    return serializeKeyValue(name, help, "counter", this.values);
  }
}

/** Streaming state for a single histogram label set -- constant memory. */
interface BucketState {
  /** Cumulative count per bucket boundary (same order as `buckets`). */
  readonly bucketCounts: number[];
  sum: number;
  count: number;
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class Histogram {
  private readonly states = new Map<string, BucketState>();
  private readonly buckets: readonly number[];

  constructor(buckets: readonly number[] = DEFAULT_BUCKETS) {
    this.buckets = buckets;
  }

  reset(): void {
    this.states.clear();
  }

  // Hot path: called per HTTP request. In-place mutation is intentional to avoid
  // allocating a new BucketState + bucketCounts array on every observation.
  observe(value: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    let state = this.states.get(key);
    if (!state) {
      state = { bucketCounts: new Array<number>(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.states.set(key, state);
    }
    for (let idx = 0; idx < this.buckets.length; idx++) {
      if (value <= this.buckets[idx]) {
        for (let bucketIndex = idx; bucketIndex < this.buckets.length; bucketIndex++) {
          state.bucketCounts[bucketIndex]++;
        }
        break;
      }
    }
    state.sum += value;
    state.count++;
  }

  serialize(name: string, help: string): string {
    const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
    for (const [key, state] of this.states) {
      const suffix = key ? `{${key},` : "{";
      for (let idx = 0; idx < this.buckets.length; idx++) {
        lines.push(`${name}_bucket${suffix}le="${this.buckets[idx]}"} ${state.bucketCounts[idx]}`);
      }
      const keySuffix = key ? `{${key}}` : "";
      lines.push(
        `${name}_bucket${suffix}le="+Inf"} ${state.count}`,
        `${name}_sum${keySuffix} ${state.sum}`,
        `${name}_count${keySuffix} ${state.count}`,
      );
    }
    if (this.states.size === 0) {
      lines.push(`${name}_bucket{le="+Inf"} 0`, `${name}_sum 0`, `${name}_count 0`);
    }
    return lines.join("\n");
  }
}

class Gauge {
  private readonly values = new Map<string, number>();

  set(value: number, labels: Labels = {}): void {
    this.values.set(labelKey(labels), value);
  }

  reset(): void {
    this.values.clear();
  }

  serialize(name: string, help: string): string {
    return serializeKeyValue(name, help, "gauge", this.values);
  }
}

/**
 * Prometheus-format metrics collector for Risoluto.
 *
 * Tracks HTTP requests, request durations, orchestrator polls,
 * agent run completions, and container resource snapshots.
 * Expose via `GET /metrics`.
 */
export class MetricsCollector {
  readonly httpRequestsTotal = new Counter();
  readonly httpRequestDurationSeconds = new Histogram();
  readonly orchestratorPollsTotal = new Counter();
  readonly agentRunsTotal = new Counter();
  readonly containerCpuPercent = new Gauge();
  readonly containerMemoryPercent = new Gauge();

  // Webhook metrics
  readonly webhookDeliveriesTotal = new Counter();
  readonly webhookDuplicatesTotal = new Counter();
  readonly webhookEventsProcessedTotal = new Counter();
  readonly webhookProcessorRetriesTotal = new Counter();
  readonly webhookDlqTotal = new Counter();
  readonly webhookSubscriptionChecksTotal = new Counter();
  readonly webhookBacklogCount = new Gauge();
  readonly webhookDlqCount = new Gauge();
  readonly webhookLastDeliveryAgeSeconds = new Gauge();
  readonly webhookProcessingLatencySeconds = new Histogram();

  /** Reset all counters, gauges, and histograms to their initial empty state. */
  reset(): void {
    this.httpRequestsTotal.reset();
    this.httpRequestDurationSeconds.reset();
    this.orchestratorPollsTotal.reset();
    this.agentRunsTotal.reset();
    this.containerCpuPercent.reset();
    this.containerMemoryPercent.reset();
    this.webhookDeliveriesTotal.reset();
    this.webhookDuplicatesTotal.reset();
    this.webhookEventsProcessedTotal.reset();
    this.webhookProcessorRetriesTotal.reset();
    this.webhookDlqTotal.reset();
    this.webhookSubscriptionChecksTotal.reset();
    this.webhookBacklogCount.reset();
    this.webhookDlqCount.reset();
    this.webhookLastDeliveryAgeSeconds.reset();
    this.webhookProcessingLatencySeconds.reset();
  }

  serialize(): string {
    return [
      this.httpRequestsTotal.serialize("risoluto_http_requests_total", "Total HTTP requests"),
      this.httpRequestDurationSeconds.serialize(
        "risoluto_http_request_duration_seconds",
        "HTTP request duration in seconds",
      ),
      this.orchestratorPollsTotal.serialize("risoluto_orchestrator_polls_total", "Orchestrator poll cycles"),
      this.agentRunsTotal.serialize("risoluto_agent_runs_total", "Agent run completions by status"),
      this.containerCpuPercent.serialize("risoluto_container_cpu_percent", "Container CPU usage percentage"),
      this.containerMemoryPercent.serialize("risoluto_container_memory_percent", "Container memory usage percentage"),
      this.webhookDeliveriesTotal.serialize(
        "risoluto_webhook_deliveries_total",
        "Total verified webhook deliveries by result, type, and action",
      ),
      this.webhookDuplicatesTotal.serialize(
        "risoluto_webhook_duplicates_total",
        "Duplicate webhook deliveries (dedup hits)",
      ),
      this.webhookEventsProcessedTotal.serialize(
        "risoluto_webhook_events_processed_total",
        "Webhook events processed by result and mode",
      ),
      this.webhookProcessorRetriesTotal.serialize(
        "risoluto_webhook_processor_retries_total",
        "Webhook processor retries by reason",
      ),
      this.webhookDlqTotal.serialize("risoluto_webhook_dlq_total", "Events moved to dead-letter queue by reason"),
      this.webhookSubscriptionChecksTotal.serialize(
        "risoluto_webhook_subscription_checks_total",
        "Periodic subscription check results",
      ),
      this.webhookBacklogCount.serialize("risoluto_webhook_backlog_count", "Number of unprocessed webhook events"),
      this.webhookDlqCount.serialize("risoluto_webhook_dlq_count", "Number of events in dead-letter queue"),
      this.webhookLastDeliveryAgeSeconds.serialize(
        "risoluto_webhook_last_delivery_age_seconds",
        "Seconds since last verified webhook delivery",
      ),
      this.webhookProcessingLatencySeconds.serialize(
        "risoluto_webhook_processing_latency_seconds",
        "Time from webhook receipt to application",
      ),
    ].join("\n\n");
  }
}

export const globalMetrics = new MetricsCollector();

/**
 * Create a fresh, isolated MetricsCollector instance.
 * Use this for dependency injection — prefer injected instances over the
 * `globalMetrics` singleton in new code.
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}
