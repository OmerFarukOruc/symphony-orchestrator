export type ObservabilityHealthStatus = "ok" | "warn" | "error";

export interface ObservabilityHealthSurface {
  surface: string;
  component: string;
  status: ObservabilityHealthStatus;
  updatedAt: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface ObservabilityHealthSummary {
  status: ObservabilityHealthStatus;
  counts: {
    ok: number;
    warn: number;
    error: number;
  };
  surfaces: ObservabilityHealthSurface[];
}

export function summarizeHealthStatus(statuses: ObservabilityHealthStatus[]): ObservabilityHealthStatus {
  if (statuses.includes("error")) {
    return "error";
  }
  if (statuses.includes("warn")) {
    return "warn";
  }
  return "ok";
}

export function summarizeHealthSurfaces(surfaces: ObservabilityHealthSurface[]): ObservabilityHealthSummary {
  const sorted = [...surfaces].sort((left, right) => {
    const statusOrder = healthStatusRank(right.status) - healthStatusRank(left.status);
    if (statusOrder !== 0) {
      return statusOrder;
    }
    return left.surface.localeCompare(right.surface);
  });
  const counts = {
    ok: sorted.filter((surface) => surface.status === "ok").length,
    warn: sorted.filter((surface) => surface.status === "warn").length,
    error: sorted.filter((surface) => surface.status === "error").length,
  };
  return {
    status: summarizeHealthStatus(sorted.map((surface) => surface.status)),
    counts,
    surfaces: sorted,
  };
}

function healthStatusRank(status: ObservabilityHealthStatus): number {
  if (status === "error") {
    return 3;
  }
  if (status === "warn") {
    return 2;
  }
  return 1;
}
