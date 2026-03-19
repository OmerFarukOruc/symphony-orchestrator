export interface ModalController {
  root: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  open: () => void;
  close: () => void;
  destroy: () => void;
  isOpen: () => boolean;
}

interface ModalOptions {
  title: string;
  description?: string;
  onClose?: () => void;
}

export function createModal(options: ModalOptions): ModalController {
  const root = document.createElement("div");
  root.className = "modal-root";
  root.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "modal-backdrop";
  backdrop.setAttribute("aria-label", "Close dialog");

  const panel = document.createElement("section");
  panel.className = "modal-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const header = document.createElement("header");
  header.className = "modal-header";
  const copy = document.createElement("div");
  copy.className = "modal-copy";
  const title = document.createElement("h2");
  title.textContent = options.title;
  copy.append(title);
  if (options.description) {
    const description = document.createElement("p");
    description.className = "text-secondary";
    description.textContent = options.description;
    copy.append(description);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "mc-button mc-button-ghost";
  closeButton.textContent = "Close";

  const body = document.createElement("div");
  body.className = "modal-body";
  const footer = document.createElement("footer");
  footer.className = "modal-footer";
  header.append(copy, closeButton);
  panel.append(header, body, footer);
  root.append(backdrop, panel);

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  function open(): void {
    root.hidden = false;
    window.addEventListener("keydown", onKey);
    closeButton.focus();
  }

  function close(): void {
    if (root.hidden) {
      return;
    }
    root.hidden = true;
    window.removeEventListener("keydown", onKey);
    options.onClose?.();
  }

  function destroy(): void {
    window.removeEventListener("keydown", onKey);
  }

  backdrop.addEventListener("click", close);
  closeButton.addEventListener("click", close);
  return { root, body, footer, open, close, destroy, isOpen: () => !root.hidden };
}
