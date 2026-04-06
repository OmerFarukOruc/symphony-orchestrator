import { createStatCardHeader, createStatCardShell } from "../components/metric-card.js";
import { buildSparklinePath } from "./observability-helpers";

export interface WidgetDescriptor {
  title: string;
  source: "aggregate snapshot" | "backend counter" | "current snapshot" | "client trend";
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
  widgets.forEach((widget) => {
    grid.append(createWidgetCard(widget));
  });
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

function widgetCardClassName(tone?: string): string {
  const base = "mc-stat-card observability-card";
  return tone ? base + " tone-" + tone : base;
}

function createWidgetCard(widget: WidgetDescriptor): HTMLElement {
  const card = createStatCardShell({
    className: widgetCardClassName(widget.tone),
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
  const sparklineSeries = widget.sparkline;
  if (sparklineSeries?.length && sparklineSeries.some((value) => value !== sparklineSeries[0])) {
    const sparkline = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sparkline.setAttribute("viewBox", "0 0 100 36");
    sparkline.setAttribute("class", "observability-sparkline");

    const lineD = buildSparklinePath(sparklineSeries);

    const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
    area.setAttribute("d", `${lineD} L 100,36 L 0,36 Z`);
    area.setAttribute("class", "observability-chart-area");

    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", lineD);
    line.setAttribute("class", "observability-chart-line");

    const baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
    baseline.setAttribute("x1", "0");
    baseline.setAttribute("y1", "35");
    baseline.setAttribute("x2", "100");
    baseline.setAttribute("y2", "35");
    baseline.setAttribute("class", "observability-chart-axis");

    const minVal = Math.min(...sparklineSeries);
    const minLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    minLabel.setAttribute("x", "0");
    minLabel.setAttribute("y", "34");
    minLabel.setAttribute("class", "observability-chart-label");
    minLabel.textContent = formatChartLabel(minVal);

    const maxVal = Math.max(...sparklineSeries);
    const maxLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    maxLabel.setAttribute("x", "100");
    maxLabel.setAttribute("y", "10");
    maxLabel.setAttribute("text-anchor", "end");
    maxLabel.setAttribute("class", "observability-chart-label");
    maxLabel.textContent = formatChartLabel(maxVal);

    sparkline.append(area, line, baseline, minLabel, maxLabel);
    card.append(sparkline);
  } else if (sparklineSeries?.length) {
    const unavailable = document.createElement("p");
    unavailable.className = "observability-chart-unavailable";
    unavailable.textContent = "Trend unavailable";
    card.append(unavailable);
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

function formatChartLabel(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}
