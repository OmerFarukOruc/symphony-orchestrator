interface RawMetricsDrawerController {
  root: HTMLElement;
  render: (rawMetrics: string, open: boolean) => void;
}

export function createRawMetricsDrawer(onClose: () => void): RawMetricsDrawerController {
  const root = document.createElement("aside");
  root.className = "mc-drawer observability-raw-drawer";
  const header = document.createElement("div");
  header.className = "observability-raw-header";
  header.innerHTML = `<div><h2>Raw /metrics</h2><p class="text-secondary">Prometheus text payload from the latest fetch. Press x to close.</p></div>`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "mc-button mc-button-ghost";
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
      body.textContent = rawMetrics.trim() || "Instrumentation not yet present.";
    },
  };
}
