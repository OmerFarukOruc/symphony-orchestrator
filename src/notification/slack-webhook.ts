import type { SymphonyLogger } from "../core/types.js";
import {
  type NotificationChannel,
  type NotificationEvent,
  type NotificationVerbosity,
  shouldDeliverByVerbosity,
} from "./channel.js";

const DEFAULT_TIMEOUT_MS = 10_000;

function metadataLines(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) {
    return [];
  }
  return Object.entries(metadata)
    .slice(0, 8)
    .map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return `${key}: ${String(value)}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    });
}

function slackColorForSeverity(severity: NotificationEvent["severity"]): string {
  return severity === "critical" ? "#d32f2f" : "#1d4ed8";
}

function slackSeverityTag(severity: NotificationEvent["severity"]): string {
  return severity === "critical" ? "CRITICAL" : "INFO";
}

function buildSlackPayload(event: NotificationEvent): Record<string, unknown> {
  const details = [
    `Issue: ${event.issue.identifier}`,
    `Attempt: ${event.attempt ?? "n/a"}`,
    `Type: ${event.type}`,
    `Severity: ${slackSeverityTag(event.severity)}`,
    `At: ${event.timestamp}`,
  ];
  if (event.issue.state) {
    details.push(`State: ${event.issue.state}`);
  }
  const metadata = metadataLines(event.metadata);
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Symphony ${slackSeverityTag(event.severity)} ${event.type}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${event.issue.identifier}* - ${event.issue.title}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: event.message,
      },
    },
    {
      type: "context",
      elements: details.map((line) => ({ type: "mrkdwn", text: line })),
    },
  ];

  if (event.issue.url) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${event.issue.url}|Open issue in Linear>`,
      },
    });
  }
  if (metadata.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`${metadata.join("\n")}\`\`\``,
      },
    });
  }

  return {
    text: `[Symphony ${slackSeverityTag(event.severity)}] ${event.issue.identifier}: ${event.message}`,
    attachments: [
      {
        color: slackColorForSeverity(event.severity),
        blocks,
      },
    ],
  };
}

interface SlackWebhookChannelOptions {
  webhookUrl: string;
  verbosity: NotificationVerbosity;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  logger?: SymphonyLogger;
}

export class SlackWebhookChannel implements NotificationChannel {
  readonly name = "slack_webhook";

  private readonly timeoutMs: number;

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: SlackWebhookChannelOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async notify(event: NotificationEvent): Promise<void> {
    if (!shouldDeliverByVerbosity(event, this.options.verbosity)) {
      return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.options.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(buildSlackPayload(event)),
        signal: abortController.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`slack webhook request failed with status ${response.status}: ${body}`);
      }
    } catch (error) {
      this.options.logger?.error(
        {
          channel: this.name,
          eventType: event.type,
          issueIdentifier: event.issue.identifier,
          error: error instanceof Error ? error.message : String(error),
        },
        "notification delivery failed",
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
