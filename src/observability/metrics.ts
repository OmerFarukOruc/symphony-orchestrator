type Labels = Record<string, string>;

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
    ].join("\n\n");
  }
}

export const globalMetrics = new MetricsCollector();
