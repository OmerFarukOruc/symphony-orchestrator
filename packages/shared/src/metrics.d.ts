/**
 * Counter metric — tracks monotonically increasing values.
 */
export interface CounterInterface {
  increment(labels?: Record<string, string>): void;
}
/**
 * Histogram metric — tracks value distributions.
 */
export interface HistogramInterface {
  observe(value: number, labels?: Record<string, string>): void;
}
/**
 * Gauge metric — tracks values that can go up and down.
 */
export interface GaugeInterface {
  set(value: number, labels?: Record<string, string>): void;
}
/**
 * Metrics collector interface matching the prom-client implementation.
 *
 * Named properties correspond to the Prometheus metric names registered
 * by the concrete `MetricsCollector` class in `src/observability/metrics.ts`.
 */
export interface MetricsCollectorInterface {
  readonly httpRequestsTotal: CounterInterface;
  readonly httpRequestDurationSeconds: HistogramInterface;
  readonly orchestratorPollsTotal: CounterInterface;
  readonly agentRunsTotal: CounterInterface;
  readonly containerCpuPercent: GaugeInterface;
  readonly containerMemoryPercent: GaugeInterface;
  serialize(): Promise<string>;
}
//# sourceMappingURL=metrics.d.ts.map
