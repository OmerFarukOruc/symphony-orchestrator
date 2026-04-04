import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { NotificationDeliverySummary, NotificationRecord, RisolutoLogger } from "../core/types.js";
import type { NotificationStorePort } from "../persistence/sqlite/notification-store.js";
import type { NotificationChannel, NotificationEvent } from "./channel.js";
import { toErrorString } from "../utils/type-guards.js";

interface NotificationManagerOptions {
  channels?: NotificationChannel[];
  logger?: RisolutoLogger;
  dedupeWindowMs?: number;
  eventBus?: TypedEventBus<RisolutoEventMap>;
  store?: NotificationStorePort;
}

export interface NotificationDispatchOptions {
  channelNames?: string[];
}

export class NotificationManager {
  private readonly channels = new Map<string, NotificationChannel>();

  private readonly dedupeWindowMs: number;

  private readonly recentlyDelivered = new Map<string, number>();

  constructor(private readonly options: NotificationManagerOptions = {}) {
    for (const channel of options.channels ?? []) {
      this.channels.set(channel.name, channel);
    }
    this.dedupeWindowMs = options.dedupeWindowMs ?? 30_000;
  }

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.name, channel);
  }

  removeChannel(channelName: string): boolean {
    return this.channels.delete(channelName);
  }

  listChannels(): string[] {
    return [...this.channels.keys()].sort((left, right) => left.localeCompare(right));
  }

  async notify(
    event: NotificationEvent,
    options: NotificationDispatchOptions = {},
  ): Promise<NotificationDeliveryResult> {
    const dedupeKey = this.eventDedupeKey(event);
    const notification = await this.createNotificationRecord(event, dedupeKey);
    if (notification) {
      this.options.eventBus?.emit("notification.created", { notification });
    }

    if (this.isDuplicate(dedupeKey)) {
      const duplicateSummary = {
        deliveredChannels: [],
        failedChannels: [],
        skippedDuplicate: true,
      } satisfies NotificationDeliverySummary;
      await this.updateNotificationRecord(notification, duplicateSummary);
      return duplicateSummary;
    }
    this.remember(dedupeKey);

    const deliverySummary = await this.deliver(event, options);
    await this.updateNotificationRecord(notification, deliverySummary);
    return deliverySummary;
  }

  private async deliver(
    event: NotificationEvent,
    options: NotificationDispatchOptions,
  ): Promise<NotificationDeliveryResult> {
    const deliveredChannels: string[] = [];
    const failedChannels: Array<{ channel: string; error: string }> = [];
    const allowedChannelNames = options.channelNames ? new Set(options.channelNames) : null;
    const channels = [...this.channels.values()].filter(
      (channel) => allowedChannelNames === null || allowedChannelNames.has(channel.name),
    );

    await Promise.all(
      channels.map(async (channel) => {
        try {
          await channel.notify(event);
          deliveredChannels.push(channel.name);
        } catch (error) {
          const errorText = toErrorString(error);
          failedChannels.push({ channel: channel.name, error: errorText });
          this.options.logger?.warn(
            {
              channel: channel.name,
              eventType: event.type,
              issueIdentifier: event.issue.identifier,
              error: errorText,
            },
            "notification channel failed",
          );
        }
      }),
    );

    return {
      deliveredChannels: [...deliveredChannels].sort((left, right) => left.localeCompare(right)),
      failedChannels: [...failedChannels].sort((left, right) => left.channel.localeCompare(right.channel)),
      skippedDuplicate: false,
    };
  }

  private async createNotificationRecord(
    event: NotificationEvent,
    dedupeKey: string,
  ): Promise<NotificationRecord | null> {
    if (!this.options.store) {
      return null;
    }

    try {
      return await this.options.store.create({
        type: event.type,
        severity: event.severity,
        title: event.title ?? defaultTitle(event.type),
        message: event.message,
        source: event.source ?? event.issue.identifier,
        href: event.href ?? event.issue.url ?? null,
        dedupeKey,
        metadata: buildNotificationMetadata(event),
        createdAt: event.timestamp,
      });
    } catch (error) {
      this.options.logger?.warn(
        { eventType: event.type, issueIdentifier: event.issue.identifier, error: toErrorString(error) },
        "notification persistence failed",
      );
      return null;
    }
  }

  private async updateNotificationRecord(
    notification: NotificationRecord | null,
    deliverySummary: NotificationDeliverySummary,
  ): Promise<void> {
    if (!notification || !this.options.store) {
      return;
    }

    try {
      const updated = await this.options.store.updateDeliverySummary(notification.id, deliverySummary);
      if (updated) {
        this.options.eventBus?.emit("notification.updated", { notification: updated });
      }
    } catch (error) {
      this.options.logger?.warn(
        { notificationId: notification.id, error: toErrorString(error) },
        "notification delivery summary persistence failed",
      );
    }
  }

  private eventDedupeKey(event: NotificationEvent): string {
    if (event.dedupeKey) {
      return event.dedupeKey;
    }
    return [event.type, event.issue.identifier, event.attempt ?? "none", event.severity, event.message].join("|");
  }

  private isDuplicate(key: string): boolean {
    const seenAt = this.recentlyDelivered.get(key);
    if (!seenAt) {
      return false;
    }
    const ageMs = Date.now() - seenAt;
    if (ageMs > this.dedupeWindowMs) {
      this.recentlyDelivered.delete(key);
      return false;
    }
    return true;
  }

  private remember(key: string): void {
    const now = Date.now();
    this.recentlyDelivered.set(key, now);

    for (const [existingKey, seenAt] of this.recentlyDelivered) {
      if (now - seenAt > this.dedupeWindowMs) {
        this.recentlyDelivered.delete(existingKey);
      }
    }
  }
}

type NotificationDeliveryResult = NotificationDeliverySummary;

function buildNotificationMetadata(event: NotificationEvent): Record<string, unknown> {
  return {
    ...(event.metadata ?? {}),
    issueId: event.issue.id,
    issueIdentifier: event.issue.identifier,
    issueTitle: event.issue.title,
    issueState: event.issue.state,
    issueUrl: event.issue.url,
    attempt: event.attempt,
  };
}

function defaultTitle(type: NotificationEvent["type"]): string {
  switch (type) {
    case "issue_claimed":
      return "Issue claimed";
    case "worker_launched":
      return "Worker launched";
    case "worker_completed":
      return "Worker completed";
    case "worker_retry":
      return "Worker retry queued";
    case "worker_failed":
      return "Worker attention required";
    case "automation_completed":
      return "Automation completed";
    case "automation_failed":
      return "Automation failed";
    case "alert_fired":
      return "Alert fired";
    default:
      return "Notification";
  }
}
