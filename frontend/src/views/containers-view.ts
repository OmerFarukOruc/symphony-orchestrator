import { createEmptyState } from "../components/empty-state";
import { createPageHeader, createSummaryStrip } from "../components/page-header";

export function createContainersPage(): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const header = createPageHeader(
    "Containers",
    "Monitor sandboxed agent containers — health, resource usage, and lifecycle events.",
  );

  const summaryStrip = createSummaryStrip([
    { label: "Running", value: "0" },
    { label: "Stopped", value: "0" },
    { label: "Errored", value: "0" },
    { label: "Avg CPU", value: "—" },
  ]);

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
