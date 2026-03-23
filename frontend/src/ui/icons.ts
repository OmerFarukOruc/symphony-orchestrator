type IconNodeTag = "circle" | "line" | "path" | "polyline" | "rect";

interface IconNodeDefinition {
  tag: IconNodeTag;
  attrs: Record<string, string>;
}

interface IconDefinition {
  viewBox: string;
  style: "filled" | "stroke";
  nodes: readonly IconNodeDefinition[];
}

interface IconOptions {
  size?: number;
  className?: string;
  label?: string;
}

interface IconSlotOptions extends IconOptions {
  slotClassName: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function filledIcon(path: string): IconDefinition {
  return {
    viewBox: "0 0 24 24",
    style: "filled",
    nodes: [{ tag: "path", attrs: { d: path } }],
  };
}

function strokeIcon(nodes: readonly IconNodeDefinition[]): IconDefinition {
  return {
    viewBox: "0 0 24 24",
    style: "stroke",
    nodes,
  };
}

const ICONS = {
  refresh: filledIcon(
    "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  ),
  theme: filledIcon(
    "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
  ),
  chevronLeft: filledIcon("M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"),
  menu: filledIcon("M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z"),
  overview: filledIcon("M4 11.5 12 5l8 6.5v7.5h-5v-5H9v5H4z"),
  board: filledIcon("M4 4h4v16H4zm6 0h4v12h-4zm6 0h4v8h-4z"),
  planner: filledIcon("m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"),
  config: filledIcon("M6 4h3v6H6zm9 0h3v10h-3zM6 14h3v6H6zm9 0h3v6h-3z"),
  secrets: filledIcon("M9 10V8a3 3 0 1 1 6 0v2h2v10H7V10zm2 0h2V8a1 1 0 0 0-2 0z"),
  settings: filledIcon(
    "m12 8 1.5-3h3l1 3 2.5 1.5-1 3 1 3L17.5 17l-1 3h-3L12 17l-1.5 3h-3l-1-3L4 15.5l1-3-1-3L6.5 8l1-3h3z",
  ),
  observability: filledIcon("M4 14h3l2-5 4 9 2-6h5v2h-4l-3 8-4-9-2 5H4z"),
  notifications: filledIcon(
    "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  ),
  git: filledIcon("M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-7v4h4l-5 7z"),
  containers: filledIcon(
    "M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z",
  ),
  workspaces: filledIcon("M4 20h16V4H4v16zm2-2V6h12v12H6z"),
  welcome: filledIcon(
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  ),
  emptyDefault: strokeIcon([
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
    { tag: "path", attrs: { d: "M8 15h8" } },
    { tag: "path", attrs: { d: "M9 9h.01" } },
    { tag: "path", attrs: { d: "M15 9h.01" } },
  ]),
  emptyQueue: strokeIcon([
    { tag: "rect", attrs: { x: "3", y: "3", width: "7", height: "7", rx: "1" } },
    { tag: "rect", attrs: { x: "14", y: "3", width: "7", height: "7", rx: "1" } },
    { tag: "rect", attrs: { x: "3", y: "14", width: "7", height: "7", rx: "1" } },
    { tag: "rect", attrs: { x: "14", y: "14", width: "7", height: "7", rx: "1" } },
  ]),
  emptyTerminal: strokeIcon([
    { tag: "polyline", attrs: { points: "4 17 10 11 4 5" } },
    { tag: "line", attrs: { x1: "12", y1: "19", x2: "20", y2: "19" } },
  ]),
  emptyEvents: strokeIcon([{ tag: "path", attrs: { d: "M22 12h-4l-3 9L9 3l-3 9H2" } }]),
  scrollDown: filledIcon("M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"),
  unfold: filledIcon(
    "M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z",
  ),
  copy: filledIcon(
    "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
  ),
  emptyAttention: strokeIcon([
    {
      tag: "path",
      attrs: { d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" },
    },
    { tag: "line", attrs: { x1: "12", y1: "9", x2: "12", y2: "13" } },
    { tag: "line", attrs: { x1: "12", y1: "17", x2: "12.01", y2: "17" } },
  ]),
  emptyError: strokeIcon([
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
    { tag: "line", attrs: { x1: "15", y1: "9", x2: "9", y2: "15" } },
    { tag: "line", attrs: { x1: "9", y1: "9", x2: "15", y2: "15" } },
  ]),
  emptyNetwork: strokeIcon([
    { tag: "path", attrs: { d: "M5 12.55a11 11 0 0 1 14.08 0" } },
    { tag: "path", attrs: { d: "M1.42 9a16 16 0 0 1 21.16 0" } },
    { tag: "path", attrs: { d: "M8.53 16.11a6 6 0 0 1 6.95 0" } },
    { tag: "line", attrs: { x1: "12", y1: "20", x2: "12.01", y2: "20" } },
  ]),
  eye: strokeIcon([
    { tag: "path", attrs: { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" } },
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "3" } },
  ]),
  eyeOff: strokeIcon([
    {
      tag: "path",
      attrs: {
        d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24",
      },
    },
    { tag: "line", attrs: { x1: "1", y1: "1", x2: "23", y2: "23" } },
  ]),
  sort: strokeIcon([
    { tag: "path", attrs: { d: "M3 6h18" } },
    { tag: "path", attrs: { d: "M6 12h12" } },
    { tag: "path", attrs: { d: "M9 18h6" } },
  ]),
  dense: strokeIcon([
    { tag: "line", attrs: { x1: "3", y1: "6", x2: "21", y2: "6" } },
    { tag: "line", attrs: { x1: "3", y1: "12", x2: "21", y2: "12" } },
    { tag: "line", attrs: { x1: "3", y1: "18", x2: "21", y2: "18" } },
  ]),
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

function applyAttributes(element: Element, attrs: Record<string, string>): void {
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, value);
  }
}

function createIconNode(definition: IconNodeDefinition): SVGElement {
  const element = document.createElementNS(SVG_NS, definition.tag);
  applyAttributes(element, definition.attrs);
  return element;
}

export function createIcon(name: IconName, options: IconOptions = {}): SVGSVGElement {
  const definition = ICONS[name] ?? ICONS.emptyDefault;
  const size = options.size ?? 16;
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", definition.viewBox);
  icon.setAttribute("width", String(size));
  icon.setAttribute("height", String(size));
  icon.setAttribute("focusable", "false");

  if (options.className) {
    icon.setAttribute("class", options.className);
  }

  if (definition.style === "filled") {
    icon.setAttribute("fill", "currentColor");
  } else {
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.5");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
  }

  if (options.label) {
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", options.label);
  } else {
    icon.setAttribute("aria-hidden", "true");
  }

  for (const node of definition.nodes) {
    icon.append(createIconNode(node));
  }

  return icon;
}

export function createIconSlot(name: IconName, options: IconSlotOptions): HTMLSpanElement {
  const slot = document.createElement("span");
  slot.className = options.slotClassName;
  slot.setAttribute("aria-hidden", "true");
  slot.append(createIcon(name, options));
  return slot;
}
