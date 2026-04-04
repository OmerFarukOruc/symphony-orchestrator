import type { ConfigStore } from "../config/store.js";
import type { createLogger } from "../core/logger.js";
import type { NotificationChannelConfig } from "../core/types.js";
import { DesktopNotificationChannel } from "../notification/desktop.js";
import { NotificationManager } from "../notification/manager.js";
import { SlackWebhookChannel } from "../notification/slack-webhook.js";
import { WebhookChannel } from "../notification/webhook-channel.js";

function createChannel(
  config: NotificationChannelConfig,
  logger: ReturnType<typeof createLogger>,
): SlackWebhookChannel | WebhookChannel | DesktopNotificationChannel | null {
  if (!config.enabled) {
    return null;
  }

  if (config.type === "slack") {
    return new SlackWebhookChannel({
      name: config.name,
      webhookUrl: config.webhookUrl,
      verbosity: config.verbosity,
      minSeverity: config.minSeverity,
      logger: logger.child({ component: "slack-webhook", channelName: config.name }),
    });
  }

  if (config.type === "webhook") {
    return new WebhookChannel({
      name: config.name,
      url: config.url,
      headers: config.headers,
      minSeverity: config.minSeverity,
      logger: logger.child({ component: "notification-webhook", channelName: config.name }),
    });
  }

  if (config.type === "desktop") {
    return new DesktopNotificationChannel({
      name: config.name,
      enabled: config.enabled,
      minSeverity: config.minSeverity,
      logger: logger.child({ component: "desktop-notification", channelName: config.name }),
    });
  }

  return null;
}

function legacySlackChannel(configStore: ConfigStore): NotificationChannelConfig[] {
  const slack = configStore.getConfig().notifications?.slack;
  if (!slack?.webhookUrl) {
    return [];
  }
  return [
    {
      type: "slack",
      name: "slack",
      enabled: true,
      minSeverity: "info",
      webhookUrl: slack.webhookUrl,
      verbosity: slack.verbosity,
    },
  ];
}

export function wireNotifications(
  notificationManager: NotificationManager,
  configStore: ConfigStore,
  logger: ReturnType<typeof createLogger>,
): void {
  for (const channelName of notificationManager.listChannels()) {
    notificationManager.removeChannel(channelName);
  }
  const configuredChannels = configStore.getConfig().notifications?.channels ?? [];
  const channels = configuredChannels.length > 0 ? configuredChannels : legacySlackChannel(configStore);
  for (const channelConfig of channels) {
    const channel = createChannel(channelConfig, logger);
    if (channel) {
      notificationManager.registerChannel(channel);
    }
  }
}

export function watchConfigChanges(
  configStore: ConfigStore,
  notificationManager: NotificationManager,
  initialPort: number,
  logger: ReturnType<typeof createLogger>,
): void {
  configStore.subscribe(() => {
    wireNotifications(notificationManager, configStore, logger);
    const latestConfig = configStore.getConfig();
    if (latestConfig.server.port !== initialPort) {
      logger.warn(
        { previousPort: initialPort, nextPort: latestConfig.server.port },
        "server.port changed in workflow; restart required to apply",
      );
    }
  });
}
