import type { ObservabilitySummary } from "../types";

export interface ObservabilityState {
  summary: ObservabilitySummary | null;
  metricsRaw: string;
  metricsFetchedAt: number;
  loadingMetrics: boolean;
  refreshing: boolean;
  error: string | null;
  rawDrawerOpen: boolean;
}

export function createObservabilityState(): ObservabilityState {
  return {
    summary: null,
    metricsRaw: "",
    metricsFetchedAt: 0,
    loadingMetrics: true,
    refreshing: false,
    error: null,
    rawDrawerOpen: false,
  };
}
