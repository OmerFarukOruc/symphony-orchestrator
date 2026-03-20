export interface PageHeaderOptions {
  eyebrow?: string;
  actions?: HTMLElement | HTMLElement[];
  className?: string;
  titleTagName?: "div" | "h1";
}

export function createPageHeader(title: string, subtitle: string, options: PageHeaderOptions = {}): HTMLElement {
  const header = document.createElement("section");
  header.className = ["mc-strip", options.className].filter(Boolean).join(" ");

  const wrapper = document.createElement("div");
  if (options.eyebrow) {
    const eyebrow = document.createElement("p");
    eyebrow.className = "issue-identifier";
    eyebrow.textContent = options.eyebrow;
    wrapper.append(eyebrow);
  }
  const titleElement = document.createElement(options.titleTagName ?? "h1");
  titleElement.className = "page-title";
  titleElement.textContent = title;
  const p = document.createElement("p");
  p.className = "page-subtitle";
  p.textContent = subtitle;
  wrapper.append(titleElement, p);
  header.append(wrapper);

  if (Array.isArray(options.actions) && options.actions.length > 0) {
    const actions = document.createElement("div");
    actions.className = "mc-actions";
    actions.append(...options.actions);
    header.append(actions);
  } else if (options.actions instanceof HTMLElement) {
    header.append(options.actions);
  }

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
