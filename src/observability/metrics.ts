type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

class Counter {
  private readonly values = new Map<string, number>();

  increment(labels: Labels = {}): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + 1);
  }

  serialize(name: string, help: string): string {
    const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
    if (this.values.size === 0) {
      lines.push(`${name} 0`);
    } else {
      for (const [key, value] of this.values) {
        const suffix = key ? `{${key}}` : "";
        lines.push(`${name}${suffix} ${value}`);
      }
    }
    return lines.join("\n");
  }
}

class Histogram {
  private readonly observations = new Map<string, number[]>();
  private readonly buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

  observe(value: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    const existing = this.observations.get(key) ?? [];
    existing.push(value);
    this.observations.set(key, existing);
  }

  serialize(name: string, help: string): string {
    const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
    for (const [key, values] of this.observations) {
      const suffix = key ? `{${key},` : "{";
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;

      for (const bucket of this.buckets) {
        const le = sorted.filter((v) => v <= bucket).length;
        lines.push(`${name}_bucket${suffix}le="${bucket}"} ${le}`);
      }
      const keySuffix = key ? `{${key}}` : "";
      lines.push(
        `${name}_bucket${suffix}le="+Inf"} ${count}`,
        `${name}_sum${keySuffix} ${sum}`,
        `${name}_count${keySuffix} ${count}`,
      );
    }
    if (this.observations.size === 0) {
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
    const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
    if (this.values.size === 0) {
      lines.push(`${name} 0`);
    } else {
      for (const [key, value] of this.values) {
        const suffix = key ? `{${key}}` : "";
        lines.push(`${name}${suffix} ${value}`);
      }
    }
    return lines.join("\n");
  }
}

/**
 * Prometheus-format metrics collector for Symphony.
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
      this.httpRequestsTotal.serialize("symphony_http_requests_total", "Total HTTP requests"),
      this.httpRequestDurationSeconds.serialize(
        "symphony_http_request_duration_seconds",
        "HTTP request duration in seconds",
      ),
      this.orchestratorPollsTotal.serialize("symphony_orchestrator_polls_total", "Orchestrator poll cycles"),
      this.agentRunsTotal.serialize("symphony_agent_runs_total", "Agent run completions by status"),
      this.containerCpuPercent.serialize("symphony_container_cpu_percent", "Container CPU usage percentage"),
      this.containerMemoryPercent.serialize("symphony_container_memory_percent", "Container memory usage percentage"),
    ].join("\n\n");
  }
}

export const globalMetrics = new MetricsCollector();
