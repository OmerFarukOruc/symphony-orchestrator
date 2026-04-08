import type { RuntimeSnapshot } from "./runtime.js";

export interface ObservabilityMetricCounter {
  total: number;
  success: number;
  failure: number;
  last_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
}

export interface ObservabilityHealthSurface {
  surface: string;
  component: string;
  status: "ok" | "warn" | "error";
  updated_at: string;
  reason: string | null;
  details: Record<string, unknown> | null;
}

export interface ObservabilityTraceRecord {
  id: string;
  component: string;
  metric: string;
  operation: string;
  outcome: "success" | "failure";
  correlation_id: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number | null;
  reason: string | null;
  data: Record<string, unknown> | null;
}

export interface ObservabilitySessionRecord {
  key: string;
  component: string;
  status: string;
  updated_at: string;
  correlation_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ObservabilityComponentSnapshot {
  component: string;
  pid: number;
  updated_at: string;
  metrics: Record<string, ObservabilityMetricCounter>;
  health: Record<string, ObservabilityHealthSurface>;
  traces: ObservabilityTraceRecord[];
  sessions: Record<string, ObservabilitySessionRecord>;
}

export interface ObservabilitySummary {
  generated_at: string;
  snapshot_root: string;
  components: ObservabilityComponentSnapshot[];
  health: {
    status: "ok" | "warn" | "error";
    counts: {
      ok: number;
      warn: number;
      error: number;
    };
    surfaces: ObservabilityHealthSurface[];
  };
  traces: ObservabilityTraceRecord[];
  session_state: ObservabilitySessionRecord[];
  runtime_state: RuntimeSnapshot;
  raw_metrics: string;
}
