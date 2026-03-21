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

  const filterBar = document.createElement("div");
  filterBar.className = "filter-bar";
  const channels = ["All", "Slack", "System", "Alerts"];
  for (const ch of channels) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `mc-filter-chip${ch === "All" ? " is-active" : ""}`;
    chip.textContent = ch;
    chip.addEventListener("click", () => {
      for (const element of filterBar.querySelectorAll(".mc-filter-chip")) {
        element.classList.remove("is-active");
      }
      chip.classList.add("is-active");
    });
    filterBar.append(chip);
  }

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(
    createEmptyState(
      "No notifications",
      "Webhook deliveries and operator alerts land here after notifications are configured and events start flowing.",
      "Open observability",
      () => router.navigate("/observability"),
      "events",
      { secondaryActionLabel: "Review setup", secondaryActionHref: "/setup" },
    ),
  );

  page.append(header, filterBar, body);
  return page;
}
