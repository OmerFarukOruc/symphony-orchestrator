import type { SymphonyLogger } from "./types.js";
import type { NotificationChannel, NotificationEvent } from "./notification-channel.js";

export interface NotificationDeliveryResult {
  deliveredChannels: string[];
  failedChannels: Array<{ channel: string; error: string }>;
  skippedDuplicate: boolean;
}

export interface NotificationManagerOptions {
  channels?: NotificationChannel[];
  logger?: SymphonyLogger;
  dedupeWindowMs?: number;
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

  async notify(event: NotificationEvent): Promise<NotificationDeliveryResult> {
    const dedupeKey = this.eventDedupeKey(event);
    if (this.isDuplicate(dedupeKey)) {
      return {
        deliveredChannels: [],
        failedChannels: [],
        skippedDuplicate: true,
      };
    }
    this.remember(dedupeKey);

    const deliveredChannels: string[] = [];
    const failedChannels: Array<{ channel: string; error: string }> = [];
    const channels = [...this.channels.values()];

    await Promise.all(
      channels.map(async (channel) => {
        try {
          await channel.notify(event);
          deliveredChannels.push(channel.name);
        } catch (error) {
          const errorText = error instanceof Error ? error.message : String(error);
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
      deliveredChannels: deliveredChannels.sort((left, right) => left.localeCompare(right)),
      failedChannels: failedChannels.sort((left, right) => left.channel.localeCompare(right.channel)),
      skippedDuplicate: false,
    };
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
