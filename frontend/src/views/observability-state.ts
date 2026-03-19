import type { RuntimeSnapshot } from "../types";

export interface ObservabilityTrendPoint {
  capturedAt: number;
  generatedAt: string;
  running: number;
  retrying: number;
  queueDepth: number;
  totalTokens: number;
  terminalCount: number;
}

export interface ObservabilityState {
  metricsRaw: string;
  metricsFetchedAt: number;
  loadingMetrics: boolean;
  refreshing: boolean;
  error: string | null;
  rawDrawerOpen: boolean;
  trends: ObservabilityTrendPoint[];
}

export function createObservabilityState(): ObservabilityState {
  return {
    metricsRaw: "",
    metricsFetchedAt: 0,
    loadingMetrics: true,
    refreshing: false,
    error: null,
    rawDrawerOpen: false,
    trends: [],
  };
}

export function pushSnapshotTrend(state: ObservabilityState, snapshot: RuntimeSnapshot): void {
  const point: ObservabilityTrendPoint = {
    capturedAt: Date.now(),
    generatedAt: snapshot.generated_at,
    running: snapshot.counts.running,
    retrying: snapshot.counts.retrying,
    queueDepth: snapshot.queued.length,
    totalTokens: snapshot.codex_totals.total_tokens,
    terminalCount:
      snapshot.completed.length ||
      snapshot.workflow_columns.filter((column) => column.terminal).reduce((total, column) => total + column.count, 0),
  };
  const previous = state.trends[state.trends.length - 1];
  if (previous?.generatedAt === point.generatedAt) {
    state.trends[state.trends.length - 1] = point;
    return;
  }
  state.trends = [...state.trends, point].slice(-20);
}
