import type { RuntimeSnapshot } from "../core/types.js";

export function serializeSnapshot(snapshot: RuntimeSnapshot): Record<string, unknown> {
  return {
    generated_at: snapshot.generatedAt,
    counts: snapshot.counts,
    queued: snapshot.queued ?? [],
    running: snapshot.running,
    retrying: snapshot.retrying,
    completed: snapshot.completed ?? [],
    workflow_columns: (snapshot.workflowColumns ?? []).map((column) => ({
      key: column.key,
      label: column.label,
      kind: column.kind,
      terminal: Boolean(column.terminal),
      count: column.count ?? column.issues?.length ?? 0,
      issues: column.issues ?? [],
    })),
    codex_totals: {
      input_tokens: snapshot.codexTotals.inputTokens,
      output_tokens: snapshot.codexTotals.outputTokens,
      total_tokens: snapshot.codexTotals.totalTokens,
      seconds_running: snapshot.codexTotals.secondsRunning,
      cost_usd: snapshot.codexTotals.costUsd,
    },
    rate_limits: snapshot.rateLimits,
    recent_events: snapshot.recentEvents.map((event) => ({
      at: event.at,
      issue_id: event.issueId,
      issue_identifier: event.issueIdentifier,
      session_id: event.sessionId,
      event: event.event,
      message: event.message,
      content: event.content ?? null,
      metadata: event.metadata ?? null,
    })),
    stall_events: snapshot.stallEvents?.map((event) => ({
      at: event.at,
      issue_id: event.issueId,
      issue_identifier: event.issueIdentifier,
      silent_ms: event.silentMs,
      timeout_ms: event.timeoutMs,
    })),
    system_health: snapshot.systemHealth
      ? {
          status: snapshot.systemHealth.status,
          checked_at: snapshot.systemHealth.checkedAt,
          running_count: snapshot.systemHealth.runningCount,
          message: snapshot.systemHealth.message,
        }
      : undefined,
    webhook_health: snapshot.webhookHealth
      ? {
          status: snapshot.webhookHealth.status,
          effective_interval_ms: snapshot.webhookHealth.effectiveIntervalMs,
          stats: {
            deliveries_received: snapshot.webhookHealth.stats.deliveriesReceived,
            last_delivery_at: snapshot.webhookHealth.stats.lastDeliveryAt,
            last_event_type: snapshot.webhookHealth.stats.lastEventType,
          },
          last_delivery_at: snapshot.webhookHealth.lastDeliveryAt,
          last_event_type: snapshot.webhookHealth.lastEventType,
        }
      : undefined,
  };
}
