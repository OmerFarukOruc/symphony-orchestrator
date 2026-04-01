interface RawMetricsDrawerController {
  root: HTMLElement;
  render: (rawMetrics: string, open: boolean) => void;
}

export function createRawMetricsDrawer(onClose: () => void): RawMetricsDrawerController {
  const root = document.createElement("aside");
  root.className = "mc-drawer observability-raw-drawer";
  const header = document.createElement("div");
  header.className = "observability-raw-header";
  const headerContent = document.createElement("div");
  const headerHeading = document.createElement("h2");
  headerHeading.textContent = "Raw /metrics";
  const headerDetail = document.createElement("p");
  headerDetail.className = "text-secondary";
  headerDetail.textContent = "Prometheus text payload from the latest fetch. Press x to close.";
  headerContent.append(headerHeading, headerDetail);
  header.append(headerContent);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "mc-button is-ghost";
  close.textContent = "Close";
  close.addEventListener("click", onClose);
  header.append(close);
  const body = document.createElement("pre");
  body.className = "observability-raw-body";
  root.append(header, body);
  return {
    root,
    render: (rawMetrics, open) => {
      root.hidden = !open;
      body.textContent = rawMetrics.trim() || "No metrics endpoint response yet.";
    },
  };
}
