import { summarizeHealthSurfaces, type ObservabilityHealthStatus, type ObservabilityHealthSurface } from "./health.js";
import { recordMetricCounter } from "./metrics.js";
import type { ObservabilityMetricCounter } from "./metrics.js";
import {
  readComponentSnapshots,
  resolveObservabilityRoot,
  type ComponentObservabilitySnapshot,
  type ObservabilitySessionRecord,
  type ObservabilitySummary,
  writeComponentSnapshot,
} from "./snapshot.js";
import { buildTraceRecord, type ObservabilityTraceRecord, type TraceOutcome } from "./tracing.js";

interface ObservabilityHubOptions {
  archiveDir?: string;
  maxTracesPerComponent?: number;
  maxSessionsPerComponent?: number;
  aggregateTraceLimit?: number;
}

interface RecordOperationInput {
  metric: string;
  operation?: string;
  outcome: TraceOutcome;
  correlationId?: string | null;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number | null;
  reason?: string | null;
  data?: Record<string, unknown>;
}

export class ComponentObserver {
  private readonly metrics = new Map<string, ObservabilityMetricCounter>();
  private readonly health = new Map<string, ObservabilityHealthSurface>();
  private readonly sessions = new Map<string, ObservabilitySessionRecord>();
  private traces: ObservabilityTraceRecord[] = [];
  private updatedAt = new Date().toISOString();
  private persistQueue = Promise.resolve();

  constructor(
    private readonly root: string,
    readonly component: string,
    private readonly maxTraces: number,
    private readonly maxSessions: number,
  ) {}

  recordOperation(input: RecordOperationInput): void {
    const endedAt = input.endedAt ?? new Date().toISOString();
    const nextCounter = recordMetricCounter(this.metrics.get(input.metric), {
      outcome: input.outcome,
      at: endedAt,
      reason: input.reason ?? null,
    });
    this.metrics.set(input.metric, nextCounter);
    this.traces = [
      buildTraceRecord(this.component, {
        ...input,
        endedAt,
      }),
      ...this.traces,
    ].slice(0, this.maxTraces);
    this.touch(endedAt);
  }

  setHealth(input: {
    surface: string;
    status: ObservabilityHealthStatus;
    reason?: string;
    details?: Record<string, unknown>;
  }): void {
    const updatedAt = new Date().toISOString();
    this.health.set(input.surface, {
      surface: input.surface,
      component: this.component,
      status: input.status,
      updatedAt,
      reason: input.reason,
      details: input.details,
    });
    this.touch(updatedAt);
  }

  setSession(
    key: string,
    input: { status: string; correlationId?: string | null; metadata?: Record<string, unknown>; updatedAt?: string },
  ): void {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    this.sessions.set(key, {
      key,
      component: this.component,
      status: input.status,
      updatedAt,
      correlationId: input.correlationId ?? null,
      metadata: input.metadata,
    });
    this.trimSessions();
    this.touch(updatedAt);
  }

  clearSession(key: string): void {
    if (!this.sessions.delete(key)) {
      return;
    }
    this.touch();
  }

  snapshot(): ComponentObservabilitySnapshot {
    return {
      component: this.component,
      pid: process.pid,
      updatedAt: this.updatedAt,
      metrics: Object.fromEntries(this.metrics),
      health: Object.fromEntries(this.health),
      traces: [...this.traces],
      sessions: Object.fromEntries(this.sessions),
    };
  }

  async drain(): Promise<void> {
    await this.persistQueue;
  }

  private touch(updatedAt = new Date().toISOString()): void {
    this.updatedAt = updatedAt;
    this.persistQueue = this.persistQueue
      .catch(() => undefined)
      .then(() => writeComponentSnapshot(this.root, this.snapshot()))
      .catch(() => undefined);
  }

  private trimSessions(): void {
    while (this.sessions.size > this.maxSessions) {
      const oldestSession = [...this.sessions.values()].sort(
        (left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
      )[0];
      const oldestKey = oldestSession?.key;
      if (!oldestKey) {
        return;
      }
      this.sessions.delete(oldestKey);
    }
  }
}

export class ObservabilityHub {
  private readonly root: string;
  private readonly observers = new Map<string, ComponentObserver>();
  private readonly maxTraces: number;
  private readonly maxSessions: number;
  private readonly aggregateTraceLimit: number;

  constructor(options: ObservabilityHubOptions = {}) {
    this.root = resolveObservabilityRoot(options.archiveDir);
    this.maxTraces = options.maxTracesPerComponent ?? 50;
    this.maxSessions = options.maxSessionsPerComponent ?? 25;
    this.aggregateTraceLimit = options.aggregateTraceLimit ?? 100;
  }

  get snapshotRoot(): string {
    return this.root;
  }

  getComponent(component: string): ComponentObserver {
    let observer = this.observers.get(component);
    if (!observer) {
      observer = new ComponentObserver(this.root, component, this.maxTraces, this.maxSessions);
      this.observers.set(component, observer);
    }
    return observer;
  }

  async drain(): Promise<void> {
    await Promise.all([...this.observers.values()].map((observer) => observer.drain()));
  }

  async aggregate(input: {
    runtimeState: Record<string, unknown>;
    rawMetrics: string;
    attemptStoreConfigured: boolean;
  }): Promise<ObservabilitySummary> {
    const persisted = await readComponentSnapshots(this.root);
    const inMemory = [...this.observers.values()].map((observer) => observer.snapshot());
    const components = dedupeSnapshots([...persisted, ...inMemory]);
    const surfaces = components.flatMap((component) => Object.values(component.health));
    surfaces.push(buildDatabaseHealthSurface(input.attemptStoreConfigured));
    const traces = components
      .flatMap((component) => component.traces)
      .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
      .slice(0, this.aggregateTraceLimit);
    const sessionState = components
      .flatMap((component) => Object.values(component.sessions))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return {
      generatedAt: new Date().toISOString(),
      snapshotRoot: this.root,
      components: [...components].sort((left, right) => left.component.localeCompare(right.component)),
      health: summarizeHealthSurfaces(surfaces),
      traces,
      sessionState,
      runtimeState: input.runtimeState,
      rawMetrics: input.rawMetrics,
    };
  }
}

export function createObservabilityHub(options: ObservabilityHubOptions = {}): ObservabilityHub {
  return new ObservabilityHub(options);
}

function dedupeSnapshots(snapshots: ComponentObservabilitySnapshot[]): ComponentObservabilitySnapshot[] {
  const merged = new Map<string, ComponentObservabilitySnapshot>();
  for (const snapshot of snapshots) {
    merged.set(`${snapshot.component}:${snapshot.pid}`, snapshot);
  }
  return [...merged.values()];
}

function buildDatabaseHealthSurface(attemptStoreConfigured: boolean): ObservabilityHealthSurface {
  return {
    surface: "database",
    component: "persistence",
    status: attemptStoreConfigured ? "ok" : "warn",
    updatedAt: new Date().toISOString(),
    reason: attemptStoreConfigured ? "attempt store configured" : "attempt store not configured",
  };
}
