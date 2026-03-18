import type { ConfigStore } from "../config/store.js";
import type { createLogger } from "../core/logger.js";
import { NotificationManager } from "../notification/manager.js";
import { SlackWebhookChannel } from "../notification/slack-webhook.js";

export function wireNotifications(
  notificationManager: NotificationManager,
  configStore: ConfigStore,
  logger: ReturnType<typeof createLogger>,
): void {
  for (const channelName of notificationManager.listChannels()) {
    notificationManager.removeChannel(channelName);
  }
  const slack = configStore.getConfig().notifications?.slack;
  if (slack?.webhookUrl) {
    notificationManager.registerChannel(
      new SlackWebhookChannel({
        webhookUrl: slack.webhookUrl,
        verbosity: slack.verbosity,
        logger: logger.child({ component: "slack-webhook" }),
      }),
    );
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
