export type HealthStatus = "healthy" | "degraded" | "critical";

export interface SystemHealth {
  status: HealthStatus;
  checkedAt: string;
  runningCount: number;
  message: string;
}
