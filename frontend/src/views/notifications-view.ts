import { createEmptyState } from "../components/empty-state";
import { createPageHeader } from "../components/page-header";
import { router } from "../router";

export function createNotificationsPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Notifications",
    "Webhook deliveries, system alerts, and operator notifications in one timeline.",
  );

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(
    createEmptyState(
      "Notification history needs backend API support",
      "This page will show webhook deliveries, Slack and system alerts, and notification history once the backend exposes notification delivery and alert timeline APIs. Until then, use Overview to open issue details for issue-specific events and Observability for live service signals.",
      "Open overview",
      () => router.navigate("/"),
      "events",
      { secondaryActionLabel: "Open observability", secondaryActionHref: "/observability" },
    ),
  );

  page.append(header, body);
  return page;
}
