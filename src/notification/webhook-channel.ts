import type { RisolutoLogger } from "../core/types.js";
import type { NotificationSeverity } from "../core/notification-types.js";
import { type NotificationChannel, type NotificationEvent, shouldDeliverByMinSeverity } from "./channel.js";
import { toErrorString } from "../utils/type-guards.js";

const DEFAULT_TIMEOUT_MS = 10_000;

interface WebhookChannelOptions {
  name: string;
  url: string;
  minSeverity?: NotificationSeverity;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  logger?: RisolutoLogger;
}

function buildPayload(event: NotificationEvent): Record<string, unknown> {
  return {
    notification: {
      type: event.type,
      severity: event.severity,
      title: event.title ?? event.issue.title,
      message: event.message,
      source: event.source ?? "risoluto",
      href: event.href ?? event.issue.url,
      timestamp: event.timestamp,
      issue: event.issue,
      attempt: event.attempt,
      metadata: event.metadata ?? null,
    },
  };
}

export class WebhookChannel implements NotificationChannel {
  readonly name: string;

  private readonly timeoutMs: number;

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: WebhookChannelOptions) {
    this.name = options.name;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async notify(event: NotificationEvent): Promise<void> {
    if (!shouldDeliverByMinSeverity(event.severity, this.options.minSeverity ?? "info")) {
      return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...(this.options.headers ?? {}),
        },
        body: JSON.stringify(buildPayload(event)),
        signal: abortController.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`webhook request failed with status ${response.status}: ${body}`);
      }
    } catch (error) {
      this.options.logger?.error(
        {
          channel: this.name,
          eventType: event.type,
          issueIdentifier: event.issue.identifier,
          error: toErrorString(error),
        },
        "notification delivery failed",
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
