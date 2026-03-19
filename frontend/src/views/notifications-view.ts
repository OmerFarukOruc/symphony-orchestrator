import { createEmptyState } from "../components/empty-state";
import { createPageHeader } from "../components/page-header";

export function createNotificationsPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Notifications",
    "Webhook deliveries, system alerts, and operator notifications in one timeline.",
  );

  const filterBar = document.createElement("div");
  filterBar.className = "filter-bar";
  const channels = ["All", "Slack", "System", "Alerts"];
  for (const ch of channels) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `filter-chip${ch === "All" ? " is-active" : ""}`;
    chip.textContent = ch;
    chip.addEventListener("click", () => {
      filterBar.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
    });
    filterBar.append(chip);
  }

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(
    createEmptyState(
      "No notifications",
      "Notifications will appear here when webhooks fire or system alerts trigger.",
      undefined,
      undefined,
      "events",
    ),
  );

  page.append(header, filterBar, body);
  return page;
}
