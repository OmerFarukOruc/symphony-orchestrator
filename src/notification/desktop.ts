import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RisolutoLogger } from "../core/types.js";
import type { NotificationSeverity } from "../core/notification-types.js";
import { type NotificationChannel, type NotificationEvent, shouldDeliverByMinSeverity } from "./channel.js";
import { toErrorString } from "../utils/type-guards.js";

const execFileAsync = promisify(execFile);

type RunCommand = (command: string, args: string[]) => Promise<void>;

interface DesktopNotificationChannelOptions {
  name: string;
  enabled?: boolean;
  minSeverity?: NotificationSeverity;
  logger?: RisolutoLogger;
  runCommand?: RunCommand;
}

function escapeAppleScript(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function buildDesktopTitle(event: NotificationEvent): string {
  return event.title ?? `Risoluto ${event.severity.toUpperCase()}`;
}

function buildDesktopMessage(event: NotificationEvent): string {
  return `${event.issue.identifier}: ${event.message}`;
}

function defaultRunCommand(command: string, args: string[]): Promise<void> {
  return execFileAsync(command, args).then(() => undefined);
}

export class DesktopNotificationChannel implements NotificationChannel {
  readonly name: string;

  private readonly enabled: boolean;

  private readonly runCommand: RunCommand;

  constructor(private readonly options: DesktopNotificationChannelOptions) {
    this.name = options.name;
    this.enabled = options.enabled ?? true;
    this.runCommand = options.runCommand ?? defaultRunCommand;
  }

  async notify(event: NotificationEvent): Promise<void> {
    if (!this.enabled) {
      return;
    }
    if (!shouldDeliverByMinSeverity(event.severity, this.options.minSeverity ?? "info")) {
      return;
    }

    const title = buildDesktopTitle(event);
    const message = buildDesktopMessage(event);

    try {
      if (process.platform === "linux") {
        await this.runCommand("notify-send", [title, message]);
        return;
      }
      if (process.platform === "darwin") {
        await this.runCommand("osascript", [
          "-e",
          `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}"`,
        ]);
        return;
      }
      this.options.logger?.warn(
        { channel: this.name, platform: process.platform },
        "desktop notifications are not supported on this platform",
      );
    } catch (error) {
      const errorText = toErrorString(error);
      this.options.logger?.warn(
        {
          channel: this.name,
          eventType: event.type,
          issueIdentifier: event.issue.identifier,
          error: errorText,
        },
        "desktop notification delivery failed",
      );
    }
  }
}
