import type { AlertHistoryStorePort, AlertHistoryStatus } from "./history-store.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { AlertRuleConfig, NotificationDeliverySummary, RisolutoLogger } from "../core/types.js";
import type { ConfigStore } from "../config/store.js";
import type { NotificationManager } from "../notification/manager.js";
import { toErrorString } from "../utils/type-guards.js";

type EventPayload = RisolutoEventMap[keyof RisolutoEventMap];

export interface AlertPipelineOptions {
  configStore: ConfigStore;
  notificationManager: NotificationManager;
  historyStore: AlertHistoryStorePort;
  logger: RisolutoLogger;
}

export class AlertPipeline {
  private readonly recentDeliveries = new Map<string, number>();

  constructor(private readonly options: AlertPipelineOptions) {}

  async processEvent(eventType: string, payload: EventPayload): Promise<void> {
    const rules = this.options.configStore.getConfig().alerts?.rules ?? [];
    const matchingRules = rules.filter((rule) => rule.enabled && matchesEventType(rule, eventType));
    if (matchingRules.length === 0) {
      return;
    }

    for (const rule of matchingRules) {
      await this.evaluateRule(rule, eventType, payload);
    }
  }

  private async evaluateRule(rule: AlertRuleConfig, eventType: string, payload: EventPayload): Promise<void> {
    const now = Date.now();
    const cooldownKey = buildCooldownKey(rule, eventType, payload);
    const previousDeliveryAt = this.recentDeliveries.get(cooldownKey);
    if (previousDeliveryAt !== undefined && now - previousDeliveryAt < rule.cooldownMs) {
      await this.recordHistory(rule, eventType, "suppressed", payload, {
        deliveredChannels: [],
        failedChannels: [],
        skippedDuplicate: true,
      });
      return;
    }
    this.recentDeliveries.set(cooldownKey, now);

    const notificationEvent = buildNotificationEvent(rule, eventType, payload);
    const deliverySummary = await this.options.notificationManager.notify(notificationEvent, {
      channelNames: rule.channels.length > 0 ? rule.channels : undefined,
    });
    await this.recordHistory(rule, eventType, summarizeStatus(deliverySummary), payload, deliverySummary);
  }

  private async recordHistory(
    rule: AlertRuleConfig,
    eventType: string,
    status: AlertHistoryStatus,
    payload: EventPayload,
    deliverySummary: NotificationDeliverySummary,
  ): Promise<void> {
    const message = buildAlertMessage(rule, eventType, payload);
    try {
      await this.options.historyStore.create({
        ruleName: rule.name,
        eventType,
        severity: rule.severity,
        status,
        channels: [...rule.channels],
        deliveredChannels: [...deliverySummary.deliveredChannels],
        failedChannels: deliverySummary.failedChannels.map((failure) => ({ ...failure })),
        message,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.options.logger.warn(
        { ruleName: rule.name, eventType, error: toErrorString(error) },
        "alert history persistence failed",
      );
    }
  }
}

function matchesEventType(rule: AlertRuleConfig, eventType: string): boolean {
  return canonicalizeEventType(rule.type) === canonicalizeEventType(eventType);
}

function canonicalizeEventType(value: string): string {
  return value.trim().toLowerCase().replaceAll(".", "_");
}

function buildCooldownKey(rule: AlertRuleConfig, eventType: string, payload: EventPayload): string {
  const issueIdentifier = extractString(payload, ["identifier", "issueIdentifier"]);
  const issueId = extractString(payload, ["issueId"]);
  return [rule.name, canonicalizeEventType(eventType), issueIdentifier ?? issueId ?? "global"].join("|");
}

function buildNotificationEvent(rule: AlertRuleConfig, eventType: string, payload: EventPayload) {
  const identifier = extractString(payload, ["identifier", "issueIdentifier"]) ?? `alert:${rule.name}`;
  const title = `Alert: ${rule.name}`;
  return {
    type: "alert_fired" as const,
    severity: rule.severity,
    timestamp: new Date().toISOString(),
    title,
    message: buildAlertMessage(rule, eventType, payload),
    source: `alert:${rule.name}`,
    href: null,
    issue: {
      id: extractString(payload, ["issueId"]),
      identifier,
      title: extractString(payload, ["title"]) ?? title,
      state: extractString(payload, ["status"]),
      url: extractString(payload, ["url"]),
    },
    attempt: extractAttempt(payload),
    metadata: {
      eventType,
      ruleName: rule.name,
      payload,
    },
  };
}

function buildAlertMessage(rule: AlertRuleConfig, eventType: string, payload: EventPayload): string {
  const issueIdentifier = extractString(payload, ["identifier", "issueIdentifier"]);
  const error = extractString(payload, ["error", "message"]);
  if (issueIdentifier && error) {
    return `${issueIdentifier} matched ${rule.name}: ${error}`;
  }
  if (issueIdentifier) {
    return `${issueIdentifier} matched ${rule.name} via ${eventType}`;
  }
  if (error) {
    return `${rule.name} matched ${eventType}: ${error}`;
  }
  return `${rule.name} matched ${eventType}`;
}

function summarizeStatus(summary: NotificationDeliverySummary): AlertHistoryStatus {
  if (summary.deliveredChannels.length > 0 && summary.failedChannels.length === 0) {
    return "delivered";
  }
  if (summary.deliveredChannels.length === 0) {
    return summary.skippedDuplicate ? "suppressed" : "failed";
  }
  return "partial_failure";
}

function extractAttempt(payload: EventPayload): number | null {
  const value = (payload as Record<string, unknown>).attempt;
  return typeof value === "number" ? value : null;
}

function extractString(payload: EventPayload, keys: string[]): string | null {
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
