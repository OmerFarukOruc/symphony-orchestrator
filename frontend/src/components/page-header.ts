export interface PageHeaderOptions {
  eyebrow?: string;
  actions?: HTMLElement | HTMLElement[];
  className?: string;
  titleTagName?: "div" | "h1";
}

export function createPageHeader(title: string, subtitle: string, options: PageHeaderOptions = {}): HTMLElement {
  const header = document.createElement("section");
  header.className = ["mc-strip", "page-header", "page-header-strip", options.className].filter(Boolean).join(" ");

  const copy = document.createElement("div");
  copy.className = "page-header-copy";

  const text = document.createElement("div");
  text.className = "page-header-text";
  if (options.eyebrow) {
    const eyebrow = document.createElement("p");
    eyebrow.className = "issue-identifier page-header-eyebrow";
    eyebrow.textContent = options.eyebrow;
    text.append(eyebrow);
  }
  const titleElement = document.createElement(options.titleTagName ?? "h1");
  titleElement.className = "page-title";
  titleElement.textContent = title;
  text.append(titleElement);

  if (subtitle.trim() !== "") {
    const p = document.createElement("p");
    p.className = "page-subtitle";
    p.textContent = subtitle;
    text.append(p);
  }

  copy.append(text);
  header.append(copy);

  if (Array.isArray(options.actions) ? options.actions.length > 0 : options.actions instanceof HTMLElement) {
    const actions = document.createElement("div");
    actions.className = "page-header-actions mc-actions";
    if (Array.isArray(options.actions)) {
      actions.append(...options.actions);
    } else if (options.actions instanceof HTMLElement) {
      actions.append(options.actions);
    }
    header.append(actions);
  }

  return header;
}
