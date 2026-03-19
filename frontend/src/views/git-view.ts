import { createEmptyState } from "../components/empty-state";

function createPageHeader(title: string, subtitle: string): HTMLElement {
  const header = document.createElement("section");
  header.className = "mc-strip";

  const wrapper = document.createElement("div");
  const h1 = document.createElement("h1");
  h1.className = "page-title";
  h1.textContent = title;
  const p = document.createElement("p");
  p.className = "page-subtitle";
  p.textContent = subtitle;
  wrapper.append(h1, p);
  header.append(wrapper);
  return header;
}

function createSummaryStripItem(label: string, value: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "summary-strip-item";
  const labelSpan = document.createElement("span");
  labelSpan.className = "summary-strip-label";
  labelSpan.textContent = label;
  const valueSpan = document.createElement("span");
  valueSpan.className = "summary-strip-value";
  valueSpan.textContent = value;
  item.append(labelSpan, valueSpan);
  return item;
}

export function createGitPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Git & Pull Requests",
    "Track branches, pull requests, and git operations managed by the orchestrator.",
  );

  const summaryStrip = document.createElement("div");
  summaryStrip.className = "summary-strip";
  const stats = [
    { label: "Active branches", value: "0" },
    { label: "Open PRs", value: "0" },
    { label: "Merged today", value: "0" },
    { label: "Failed ops", value: "0" },
  ];
  for (const stat of stats) {
    summaryStrip.append(createSummaryStripItem(stat.label, stat.value));
  }

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
