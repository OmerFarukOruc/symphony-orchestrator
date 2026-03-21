import { createEmptyState } from "../components/empty-state";
import { createPageHeader, createSummaryStrip } from "../components/page-header";
import { router } from "../router";

export function createWorkspacesPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Workspaces",
    "Manage agent workspaces — monitor disk usage, inspect workspace state, and trigger cleanup.",
  );

  const summaryStrip = createSummaryStrip([
    { label: "Total", value: "0" },
    { label: "Active", value: "0" },
    { label: "Stale", value: "0" },
    { label: "Disk usage", value: "0 B" },
  ]);

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(
    createEmptyState(
      "No workspaces",
      "Workspaces are created automatically after Symphony picks up an issue and prepares an isolated checkout.",
      "Open queue",
      () => router.navigate("/queue"),
      "queue",
      { secondaryActionLabel: "Setup guide", secondaryActionHref: "/setup" },
    ),
  );

  page.append(header, summaryStrip, body);
  return page;
}
