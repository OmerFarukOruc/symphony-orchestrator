import { api } from "../api.js";
import { createEmptyState } from "../components/empty-state.js";
import { createPageHeader } from "../components/page-header.js";
import { skeletonBlock } from "../ui/skeleton.js";
import { router } from "../router.js";
import { getValueAtPath } from "./settings-paths.js";

function isSlackConfigured(config: Record<string, unknown>): boolean {
  const webhookUrl = getValueAtPath(config, "notifications.slack.webhook_url");
  const verbosity = getValueAtPath(config, "notifications.slack.verbosity");
  const hasWebhook = typeof webhookUrl === "string" && webhookUrl.length > 0;
  const verbosityActive = typeof verbosity === "string" && verbosity !== "off";
  return hasWebhook && verbosityActive;
}

function renderUnconfiguredState(): HTMLElement {
  return createEmptyState(
    "Notifications not configured",
    "Configure a Slack webhook and set verbosity to start receiving notifications when issues complete, fail, or need attention.",
    "Open notification settings",
    () => router.navigate("/settings"),
    "events",
  );
}

function renderConfiguredState(): HTMLElement {
  return createEmptyState(
    "No notification history yet",
    "Notifications are configured and will be sent as Slack messages when issues are processed. Delivery history will appear here in a future update.",
    "Open board",
    () => router.navigate("/queue"),
    "events",
  );
}

function renderErrorState(): HTMLElement {
  return createEmptyState(
    "Could not load notification status",
    "Unable to check notification configuration. Try refreshing the page, or visit Settings to configure notifications manually.",
    "Open settings",
    () => router.navigate("/settings"),
    "error",
  );
}

export function createNotificationsPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Notifications",
    "Webhook deliveries, system alerts, and operator notifications in one timeline.",
  );

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(skeletonBlock("200px"));

  page.append(header, body);

  void loadNotificationStatus(body);

  return page;
}

async function loadNotificationStatus(body: HTMLElement): Promise<void> {
  try {
    const config = await api.getConfig();
    body.replaceChildren(isSlackConfigured(config) ? renderConfiguredState() : renderUnconfiguredState());
  } catch {
    body.replaceChildren(renderErrorState());
  }
}
