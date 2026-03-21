export interface ModalController {
  root: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  open: () => void;
  close: () => void;
  destroy: () => void;
  isOpen: () => boolean;
  setError: (message: string | null) => void;
  resetContent: () => void;
}

interface ModalOptions {
  title: string;
  description?: string;
  onClose?: () => void;
  size?: "sm" | "md" | "lg";
}

export function createModal(options: ModalOptions): ModalController {
  const titleId = `modal-title-${crypto.randomUUID()}`;
  const descriptionId = `modal-description-${crypto.randomUUID()}`;
  const root = document.createElement("div");
  root.className = "modal-root";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "modal-backdrop";
  backdrop.setAttribute("aria-label", "Close dialog");

  const panel = document.createElement("section");
  panel.className = `modal-panel modal-panel-enhanced modal-${options.size ?? "md"}`;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", titleId);

  const header = document.createElement("header");
  header.className = "modal-header";
  const copy = document.createElement("div");
  copy.className = "modal-copy";
  const title = document.createElement("h2");
  title.id = titleId;
  title.className = "modal-title text-truncate";
  title.textContent = options.title;
  copy.append(title);
  if (options.description) {
    const description = document.createElement("p");
    description.id = descriptionId;
    description.className = "modal-description text-secondary text-wrap";
    description.textContent = options.description;
    copy.append(description);
    panel.setAttribute("aria-describedby", descriptionId);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "mc-button mc-button-ghost";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "Close";

  const body = document.createElement("div");
  body.className = "modal-body modal-body-enhanced";

  const errorContainer = document.createElement("div");
  errorContainer.className = "modal-error form-error";
  errorContainer.hidden = true;
  errorContainer.setAttribute("role", "alert");

  const footer = document.createElement("footer");
  footer.className = "modal-footer";
  header.append(copy, closeButton);
  panel.append(header, errorContainer, body, footer);
  root.append(backdrop, panel);

  let previousFocus: HTMLElement | null = null;

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "Tab") {
      const focusableElements = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  };

  function setError(message: string | null): void {
    if (message) {
      errorContainer.textContent = message;
      errorContainer.hidden = false;
    } else {
      errorContainer.hidden = true;
      errorContainer.textContent = "";
    }
  }

  function open(): void {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const otherOpenRoots = Array.from(document.querySelectorAll<HTMLElement>(".modal-root:not([hidden])")).filter(
      (other) => other !== root,
    );

    for (const other of otherOpenRoots) {
      other.hidden = true;
      other.setAttribute("aria-hidden", "true");
      other.classList.remove("is-closing");
    }

    if (otherOpenRoots.length > 0) {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    }

    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    window.addEventListener("keydown", onKey);
    closeButton.focus();
    document.body.style.overflow = "hidden";
  }

  function close(): void {
    if (root.hidden) {
      return;
    }
    root.classList.add("is-closing");
    const panel = root.querySelector<HTMLElement>(".modal-panel");
    let closed = false;
    const handleAnimationEnd = (): void => {
      if (closed) {
        return;
      }
      closed = true;
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      root.classList.remove("is-closing");
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (previousFocus) {
        previousFocus.focus();
      }
      options.onClose?.();
    };

    const timeoutId = window.setTimeout(handleAnimationEnd, 300);
    panel?.addEventListener(
      "animationend",
      () => {
        window.clearTimeout(timeoutId);
        handleAnimationEnd();
      },
      { once: true },
    );
  }

  function destroy(): void {
    close();
    window.removeEventListener("keydown", onKey);
    document.body.style.overflow = "";
    root.remove();
  }

  function resetContent(): void {
    body.replaceChildren();
    footer.replaceChildren();
    setError(null);
  }

  backdrop.addEventListener("click", close);
  closeButton.addEventListener("click", close);
  return { root, body, footer, open, close, destroy, isOpen: () => !root.hidden, setError, resetContent };
}
