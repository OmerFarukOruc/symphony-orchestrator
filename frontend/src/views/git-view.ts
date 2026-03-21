import { createEmptyState } from "../components/empty-state";
import { createPageHeader, createSummaryStrip } from "../components/page-header";
import { router } from "../router";

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
      "Branches and pull requests appear here after a run reaches the git automation stage.",
      "Open queue",
      () => router.navigate("/queue"),
      "default",
      { secondaryActionLabel: "Review credentials", secondaryActionHref: "/secrets" },
    ),
  );

  page.append(header, summaryStrip, body);
  return page;
}
