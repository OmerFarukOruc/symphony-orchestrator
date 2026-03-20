import { createStatCardHeader, createStatCardShell } from "../components/metric-card.js";
import { buildSparklinePath } from "./observability-helpers";

export interface WidgetDescriptor {
  title: string;
  source: "backend counter" | "current snapshot" | "client trend";
  value: string;
  detail: string;
  sparkline?: number[];
  tone?: "default" | "warning" | "danger";
  list?: string[];
}

export function buildSection(title: string, widgets: WidgetDescriptor[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "observability-section";
  const header = document.createElement("div");
  header.className = "observability-section-header";
  const headerWrap = document.createElement("div");
  const h2 = document.createElement("h2");
  h2.textContent = title;
  headerWrap.append(h2);
  header.append(headerWrap);
  const grid = document.createElement("div");
  grid.className = "observability-grid";
  widgets.forEach((widget) => grid.append(createWidgetCard(widget)));
  section.append(header, grid);
  return section;
}

export function buildListCard(title: string, lines: string[], source: WidgetDescriptor["source"]): WidgetDescriptor {
  return {
    title,
    source,
    value: lines.length ? `${lines.length} notice${lines.length === 1 ? "" : "s"}` : "None",
    detail: lines[0] ?? "No active warnings.",
    list: lines.length ? lines : ["No active warnings."],
    tone: lines.length ? "warning" : "default",
  };
}

export function buildCadenceSeries(capturedAtSeries: number[]): number[] {
  const series = capturedAtSeries.slice(1).map((capturedAt, index) => (capturedAt - capturedAtSeries[index]) / 1000);
  return series.length ? series : [0];
}

function createWidgetCard(widget: WidgetDescriptor): HTMLElement {
  const card = createStatCardShell({
    className: `mc-stat-card observability-card${widget.tone ? ` tone-${widget.tone}` : ""}`,
  });
  const header = createStatCardHeader({
    title: widget.title,
    kicker: widget.source,
    titleTag: "h3",
    headerClassName: "observability-card-header",
  });
  const value = document.createElement("strong");
  value.className = "observability-value";
  value.textContent = widget.value;
  const detail = document.createElement("p");
  detail.className = "text-secondary observability-detail";
  detail.textContent = widget.detail;
  card.append(header, value, detail);
  if (widget.sparkline?.length) {
    const sparkline = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sparkline.setAttribute("viewBox", "0 0 100 28");
    sparkline.setAttribute("class", "observability-sparkline");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", buildSparklinePath(widget.sparkline));
    sparkline.append(path);
    card.append(sparkline);
  }
  if (widget.list?.length) {
    const list = document.createElement("ul");
    list.className = "observability-list";
    widget.list.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      list.append(item);
    });
    card.append(list);
  }
  return card;
}
