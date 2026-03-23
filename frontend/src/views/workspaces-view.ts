import { createEmptyState } from "../components/empty-state";
import { createPageHeader } from "../components/page-header";
import { router } from "../router";

export function createWorkspacesPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Workspaces",
    "Manage agent workspaces — monitor disk usage, inspect workspace state, and trigger cleanup.",
  );

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(
    createEmptyState(
      "Workspace inventory needs backend API support",
      "This page will show active workspaces, stale checkout candidates, disk usage, and cleanup targets once the backend exposes workspace inventory and cleanup APIs. Until then, use Overview to open issue details for per-run context and Observability for runtime health.",
      "Open overview",
      () => router.navigate("/"),
      "queue",
      { secondaryActionLabel: "Open observability", secondaryActionHref: "/observability" },
    ),
  );

  page.append(header, body);
  return page;
}
