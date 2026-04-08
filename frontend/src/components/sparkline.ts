const SVG_NS = "http://www.w3.org/2000/svg";

export interface SparklineOptions {
  /** Width in px. Default: 80 */
  width?: number;
  /** Height in px. Default: 24 */
  height?: number;
  /** CSS color or custom property. Default: uses --sparkline-color token */
  color?: string;
  /** Show a filled area under the line. Default: true */
  showArea?: boolean;
  /** Accessible label. Default: "Trend sparkline" */
  label?: string;
}

/**
 * Creates a tiny inline SVG sparkline from an array of numbers.
 * Returns an empty container when data has fewer than 2 points.
 *
 * The sparkline auto-scales Y to the data range with a small padding.
 * CSS class: `.sparkline` (container), `.sparkline-line`, `.sparkline-area`.
 */
export function createSparkline(data: number[], options: SparklineOptions = {}): HTMLElement {
  const { width = 80, height = 24, color, showArea = true, label = "Trend sparkline" } = options;

  const container = document.createElement("span");
  container.className = "sparkline";

  if (data.length < 2) return container;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);

  if (color) {
    container.style.setProperty("--sparkline-color", color);
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padY = 2;
  const usableHeight = height - padY * 2;

  const points: string[] = [];
  const stepX = width / (data.length - 1);

  for (let i = 0; i < data.length; i++) {
    const x = i * stepX;
    const y = padY + usableHeight - ((data[i] - min) / range) * usableHeight;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const polylineStr = points.join(" ");

  if (showArea) {
    const areaPath = document.createElementNS(SVG_NS, "polygon");
    const areaPoints = `0,${height} ${polylineStr} ${width},${height}`;
    areaPath.setAttribute("points", areaPoints);
    areaPath.setAttribute("class", "sparkline-area");
    svg.append(areaPath);
  }

  const line = document.createElementNS(SVG_NS, "polyline");
  line.setAttribute("points", polylineStr);
  line.setAttribute("class", "sparkline-line");
  svg.append(line);

  container.append(svg);
  return container;
}
