import { createEmptyState } from "../components/empty-state";
import { createPageHeader, createSummaryStrip } from "../components/page-header";

export function createGitPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Git & Pull Requests",
    "Track branches, pull requests, and git operations managed by the orchestrator.",
  );

  const summaryStrip = createSummaryStrip([
    { label: "Active branches", value: "0" },
    { label: "Open PRs", value: "0" },
    { label: "Merged today", value: "0" },
    { label: "Failed ops", value: "0" },
  ]);

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(
    createEmptyState(
      "No git activity",
      "Git operations and pull requests will appear here as issues are processed.",
      undefined,
      undefined,
      "default",
    ),
  );

  page.append(header, summaryStrip, body);
  return page;
}
