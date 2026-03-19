const EMPTY_STATE_ICONS = {
  default: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 15h8M9 9h.01M15 9h.01"/></svg>`,
  queue: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  terminal: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  events: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  attention: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
} as const;

type EmptyStateVariant = keyof typeof EMPTY_STATE_ICONS;

function parseSvgFromTrustedSource(svgString: string): SVGElement | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg instanceof SVGElement) return svg;
  return null;
}

export function createEmptyState(
  title: string,
  detail: string,
  actionLabel?: string,
  onAction?: () => void,
  variant: EmptyStateVariant = "default",
): HTMLElement {
  const box = document.createElement("div");
  box.className = "mc-empty-state";

  const iconHtml = EMPTY_STATE_ICONS[variant] ?? EMPTY_STATE_ICONS.default;
  const icon = document.createElement("div");
  icon.className = "mc-empty-state-icon";
  const svgElement = parseSvgFromTrustedSource(iconHtml);
  if (svgElement) icon.append(svgElement);

  const heading = document.createElement("h3");
  heading.textContent = title;

  const text = document.createElement("p");
  text.className = "text-secondary";
  text.textContent = detail;

  box.append(icon, heading, text);
  if (actionLabel && onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-button mc-button-ghost";
    button.textContent = actionLabel;
    button.addEventListener("click", onAction);
    box.append(button);
  }
  return box;
}
