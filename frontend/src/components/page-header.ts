export function createPageHeader(title: string, subtitle: string): HTMLElement {
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

export interface SummaryStripItem {
  label: string;
  value: string;
}

export function createSummaryStripItem(label: string, value: string): HTMLElement {
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

export function createSummaryStrip(items: SummaryStripItem[]): HTMLElement {
  const strip = document.createElement("div");
  strip.className = "summary-strip";
  for (const item of items) {
    strip.append(createSummaryStripItem(item.label, item.value));
  }
  return strip;
}
