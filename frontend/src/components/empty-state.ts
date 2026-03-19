const EMPTY_STATE_ICONS = {
  default: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 15h8M9 9h.01M15 9h.01"/></svg>`,
  queue: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  terminal: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  events: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  attention: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  network: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
} as const;

type EmptyStateVariant = keyof typeof EMPTY_STATE_ICONS;

interface StateBoxConfig {
  containerClass: string;
  iconClass: string;
  headingClass: string;
  textClass: string;
  iconHtml: string;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}

function parseSvgFromTrustedSource(svgString: string): SVGElement | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg instanceof SVGElement) return svg;
  return null;
}

function buildStateBox(config: StateBoxConfig): HTMLElement {
  const box = document.createElement("div");
  box.className = config.containerClass;

  const icon = document.createElement("div");
  icon.className = config.iconClass;
  const svgElement = parseSvgFromTrustedSource(config.iconHtml);
  if (svgElement) icon.append(svgElement);

  const heading = document.createElement("h3");
  heading.className = config.headingClass;
  heading.style.maxWidth = "100%";
  heading.textContent = config.title;

  const text = document.createElement("p");
  text.className = config.textClass;
  text.textContent = config.detail;

  box.append(icon, heading, text);

  if (config.actionLabel && config.onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-button mc-button-ghost";
    button.textContent = config.actionLabel;
    button.addEventListener("click", config.onAction);
    box.append(button);
  }

  return box;
}

export function createEmptyState(
  title: string,
  detail: string,
  actionLabel?: string,
  onAction?: () => void,
  variant: EmptyStateVariant = "default",
): HTMLElement {
  const iconHtml = EMPTY_STATE_ICONS[variant] ?? EMPTY_STATE_ICONS.default;
  const box = buildStateBox({
    containerClass: "mc-empty-state",
    iconClass: "mc-empty-state-icon",
    headingClass: "text-truncate",
    textClass: "text-secondary text-wrap",
    iconHtml,
    title,
    detail,
    actionLabel,
    onAction,
  });
  const textEl = box.querySelector("p");
  if (textEl) textEl.style.maxWidth = "50ch";
  return box;
}

export function createErrorState(title: string, message: string, retryAction?: () => void): HTMLElement {
  const box = buildStateBox({
    containerClass: "error-state",
    iconClass: "error-state-icon",
    headingClass: "error-state-title text-truncate",
    textClass: "error-state-message",
    iconHtml: EMPTY_STATE_ICONS.error,
    title,
    detail: message,
  });

  if (retryAction) {
    const actions = document.createElement("div");
    actions.className = "error-state-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-button mc-button-ghost";
    button.textContent = "Retry";
    button.addEventListener("click", retryAction);
    actions.append(button);
    box.append(actions);
  }

  return box;
}

export function createNetworkErrorState(retryAction?: () => void): HTMLElement {
  return createErrorState(
    "Connection issue",
    "Unable to connect to the server. Please check your network connection and try again.",
    retryAction,
  );
}
