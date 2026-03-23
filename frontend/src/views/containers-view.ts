import { createEmptyState } from "../components/empty-state";
import { createPageHeader } from "../components/page-header";
import { router } from "../router";

export function createContainersPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Containers",
    "Monitor sandboxed agent containers — health, resource usage, and lifecycle events.",
  );

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(
    createEmptyState(
      "Container telemetry needs backend API support",
      "This page will show running sandboxes, lifecycle state, CPU and memory usage, and container failures once the backend exposes container status and stats APIs. Until then, use Overview to reach issue details for live runs and Observability for backend metrics.",
      "Open overview",
      () => router.navigate("/"),
      "network",
      { secondaryActionLabel: "Open observability", secondaryActionHref: "/observability" },
    ),
  );

  page.append(header, body);
  return page;
}
