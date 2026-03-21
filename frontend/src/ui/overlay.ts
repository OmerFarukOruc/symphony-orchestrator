export type OverlayMode = "drawer" | "modal" | "palette";
export type OverlayPosition = "center" | "left" | "right" | "top";
export type OverlayCloseReason = "programmatic" | "escape" | "backdrop";

export interface OverlayOptions {
  mode: OverlayMode;
  position?: OverlayPosition;
  width?: string;
  onClose?: (reason: OverlayCloseReason) => boolean | void;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
}

type OverlayContent = DocumentFragment | HTMLElement;

export interface OverlayController {
  open: () => void;
  close: (reason?: OverlayCloseReason) => void;
  render: (content: DocumentFragment | HTMLElement) => HTMLElement;
  isOpen: () => boolean;
}

interface OverlayElements {
  root: HTMLElement;
  backdrop: HTMLElement | null;
  surface: HTMLElement;
}

const DEFAULT_POSITION: Record<OverlayMode, OverlayPosition> = {
  drawer: "right",
  modal: "center",
  palette: "top",
};

export function createOverlay(options: OverlayOptions): OverlayController {
  const elements = createOverlayElements(options.mode, options.position ?? DEFAULT_POSITION[options.mode]);
  const closeOnEscape = options.closeOnEscape ?? true;
  const closeOnBackdrop = options.closeOnBackdrop ?? true;
  let previousFocus: Element | null = null;

  if (options.width) {
    elements.surface.style.width = options.width;
  }

  const onWindowKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !closeOnEscape) {
      return;
    }
    event.preventDefault();
    close("escape");
  };

  const onBackdropClick = (event: Event): void => {
    if (!closeOnBackdrop) {
      return;
    }
    const target = event.target;
    const clickedRoot = target === elements.root;
    const clickedBackdrop = elements.backdrop !== null && target === elements.backdrop;
    if (clickedRoot || clickedBackdrop) {
      close("backdrop");
    }
  };

  elements.root.addEventListener("click", onBackdropClick);
  elements.backdrop?.addEventListener("click", onBackdropClick);

  function render(content: OverlayContent): HTMLElement {
    elements.surface.replaceChildren(content);
    return elements.surface;
  }

  function open(): void {
    ensureAttached(elements.root);
    previousFocus = document.activeElement;
    elements.root.hidden = false;
    elements.root.setAttribute("aria-hidden", "false");
    window.addEventListener("keydown", onWindowKeydown);
    document.body.style.overflow = "hidden";
    focusOverlay(elements.surface);
  }

  function close(reason: OverlayCloseReason = "programmatic"): void {
    if (elements.root.hidden) {
      return;
    }
    if (options.onClose?.(reason) === false) {
      return;
    }
    elements.root.hidden = true;
    elements.root.setAttribute("aria-hidden", "true");
    window.removeEventListener("keydown", onWindowKeydown);
    if (!hasVisibleSharedOverlay()) {
      document.body.style.overflow = "";
    }
    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus();
    }
  }

  return { open, close, render, isOpen: () => !elements.root.hidden };
}

function createOverlayElements(mode: OverlayMode, position: OverlayPosition): OverlayElements {
  if (mode === "modal") {
    const root = document.createElement("div");
    root.className = "modal-root";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.dataset.sharedOverlayRoot = "true";

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("aria-label", "Close dialog");

    const surface = document.createElement("section");
    surface.className = `modal-panel modal-panel-enhanced is-${position}`;
    surface.setAttribute("role", "dialog");
    surface.setAttribute("aria-modal", "true");
    surface.tabIndex = -1;
    root.append(backdrop, surface);
    return { root, backdrop, surface };
  }

  if (mode === "palette") {
    const root = document.createElement("div");
    root.className = "palette-overlay";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.dataset.sharedOverlayRoot = "true";

    const surface = document.createElement("div");
    surface.className = `palette-panel is-${position}`;
    surface.tabIndex = -1;
    root.append(surface);
    return { root, backdrop: null, surface };
  }

  const root = document.createElement("div");
  root.className = "overlay-root";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.dataset.sharedOverlayRoot = "true";

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "drawer-overlay";
  backdrop.setAttribute("aria-label", "Close panel");

  const surface = document.createElement("aside");
  surface.className = `drawer mc-drawer overlay-drawer is-${position}`;
  surface.tabIndex = -1;
  root.append(backdrop, surface);
  return { root, backdrop, surface };
}

function ensureAttached(root: HTMLElement): void {
  if (!root.isConnected) {
    document.body.append(root);
  }
}

function focusOverlay(surface: HTMLElement): void {
  const focusable = surface.querySelector<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  (focusable ?? surface).focus();
}

function hasVisibleSharedOverlay(): boolean {
  return document.querySelector('[data-shared-overlay-root="true"]:not([hidden])') !== null;
}
