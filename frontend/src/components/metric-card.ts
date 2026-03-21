type StatCardTagName = "article" | "div" | "section";
type StatCardTitleTag = "h2" | "h3";

export interface StatCardShellOptions {
  tagName?: StatCardTagName;
  className?: string;
}

export interface StatCardHeaderOptions {
  title: string;
  kicker?: string;
  titleTag?: StatCardTitleTag;
  headerClassName?: string;
  titleClassName?: string;
  kickerClassName?: string;
}

function joinClasses(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

export function createStatCardShell(options: StatCardShellOptions = {}): HTMLElement {
  const card = document.createElement(options.tagName ?? "section");
  card.className = options.className ?? "mc-stat-card";
  return card;
}

export function createStatCardHeader(options: StatCardHeaderOptions): HTMLElement {
  const header = document.createElement("div");
  header.className = joinClasses("mc-stat-card-header", options.headerClassName);

  const titleEl = document.createElement(options.titleTag ?? "h2");
  titleEl.className = joinClasses("mc-stat-card-title", options.titleClassName);
  titleEl.textContent = options.title;
  header.append(titleEl);

  if (options.kicker) {
    const kickerEl = document.createElement("span");
    kickerEl.className = joinClasses("mc-badge", options.kickerClassName);
    kickerEl.textContent = options.kicker;
    header.append(kickerEl);
  }

  return header;
}

function createMetricCard(title: string, kicker?: string): HTMLElement {
  const card = createStatCardShell();
  const header = createStatCardHeader({ title, kicker });
  const body = document.createElement("div");
  body.className = "mc-stat-card-body";
  card.append(header, body);
  return Object.assign(card, { body });
}
