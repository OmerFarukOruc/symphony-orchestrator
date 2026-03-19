import { createEmptyState } from "../components/empty-state";
import { createPageHeader, createSummaryStrip } from "../components/page-header";

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
      "Workspaces are created automatically when the orchestrator processes issues.",
      undefined,
      undefined,
      "queue",
    ),
  );

  page.append(header, summaryStrip, body);
  return page;
}
