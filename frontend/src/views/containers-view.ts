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

export function createContainersPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Containers",
    "Monitor sandboxed agent containers — health, resource usage, and lifecycle events.",
  );

  const summaryStrip = document.createElement("div");
  summaryStrip.className = "summary-strip";
  const stats = [
    { label: "Running", value: "0" },
    { label: "Stopped", value: "0" },
    { label: "Errored", value: "0" },
    { label: "Avg CPU", value: "—" },
  ];
  for (const stat of stats) {
    summaryStrip.append(createSummaryStripItem(stat.label, stat.value));
  }

  const body = document.createElement("section");
  body.className = "page-body";
  body.append(
    createEmptyState(
      "No containers",
      "Containers are provisioned when sandbox mode is enabled.",
      undefined,
      undefined,
      "default",
    ),
  );

  page.append(header, summaryStrip, body);
  return page;
}
