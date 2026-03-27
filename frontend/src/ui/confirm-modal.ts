import { createOverlay } from "./overlay.js";

export type ConfirmModalVariant = "primary" | "danger" | "warning";
export type ConfirmModalBody = DocumentFragment | HTMLElement;

export interface ConfirmModalControls {
  body: HTMLElement;
  cancelButton: HTMLButtonElement;
  close: () => void;
  confirmButton: HTMLButtonElement;
  root: HTMLElement;
  setConfirmDisabled: (disabled: boolean) => void;
}

export interface ConfirmModalOptions {
  title: string;
  body: ConfirmModalBody;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
  pendingLabel?: string;
  onConfirm?: () => boolean | void | Promise<boolean | void>;
  onCancel?: () => void;
  onClose?: () => void;
  onOpen?: (controls: ConfirmModalControls) => void;
}

export function openConfirmModal(options: ConfirmModalOptions): () => void {
  let confirmRequested = false;
  let pending = false;
  let closeReason: "cancel" | "confirm" | null = null;
  let overlayRoot: HTMLElement | null = null;
  const overlay = createOverlay({
    mode: "modal",
    closeOnBackdrop: true,
    closeOnEscape: true,
    onClose: () => {
      if (pending) {
        return false;
      }
      const cancelled = closeReason !== "confirm";
      if (cancelled) {
        options.onCancel?.();
      }
      options.onClose?.();
      overlayRoot?.remove();
      closeReason = null;
      confirmRequested = false;
      return true;
    },
  });

  const content = document.createElement("div");
  content.className = "confirm-modal-shell";
  const header = document.createElement("header");
  header.className = "modal-header";
  const copy = document.createElement("div");
  copy.className = "modal-copy confirm-modal-copy";
  const title = document.createElement("h2");
  title.className = "text-truncate";
  title.style.maxWidth = "100%";
  title.textContent = options.title;
  copy.append(title);
  header.append(copy);

  const body = document.createElement("div");
  body.className = "modal-body modal-body-enhanced confirm-modal-body";
  appendBodyContent(body, options.body);

  const footer = document.createElement("footer");
  footer.className = "modal-footer confirm-modal-footer";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "mc-button is-ghost";
  cancelButton.textContent = options.cancelLabel ?? "Cancel";

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = confirmButtonClass(options.variant ?? "primary");
  confirmButton.textContent = options.confirmLabel;
  footer.append(cancelButton, confirmButton);
  content.append(header, body, footer);

  const panel = overlay.render(content);
  overlayRoot = panel.parentElement;
  const titleId = `confirm-modal-title-${crypto.randomUUID().slice(0, 8)}`;
  title.id = titleId;
  panel.setAttribute("aria-labelledby", titleId);

  const controls: ConfirmModalControls = {
    body,
    cancelButton,
    close: () => close("cancel"),
    confirmButton,
    root: panel,
    setConfirmDisabled: (disabled) => {
      confirmButton.disabled = disabled || pending;
    },
  };

  cancelButton.addEventListener("click", () => close("cancel"));
  confirmButton.addEventListener("click", () => {
    if (confirmButton.disabled || pending) {
      return;
    }
    void handleConfirm();
  });

  options.onOpen?.(controls);
  overlay.open();
  return controls.close;

  function close(reason: "cancel" | "confirm"): void {
    closeReason = reason;
    overlay.close("programmatic");
  }

  async function handleConfirm(): Promise<void> {
    pending = true;
    confirmRequested = true;
    cancelButton.disabled = true;
    confirmButton.disabled = true;
    confirmButton.textContent = options.pendingLabel ?? "Working…";
    try {
      const result = await options.onConfirm?.();
      if (result === false) {
        return;
      }
      // Clear pending before close so the onClose callback doesn't block dismissal
      pending = false;
      close("confirm");
    } catch (error) {
      console.error("Confirm modal action failed:", error);
    } finally {
      pending = false;
      if (!confirmRequested || overlay.isOpen()) {
        cancelButton.disabled = false;
        confirmButton.disabled = false;
        confirmButton.textContent = options.confirmLabel;
      }
      confirmRequested = false;
    }
  }
}

function appendBodyContent(target: HTMLElement, body: ConfirmModalBody): void {
  target.replaceChildren(body);
}

function confirmButtonClass(variant: ConfirmModalVariant): string {
  const variantClass = variant === "primary" ? "is-primary" : `confirm-modal-button--${variant}`;
  return `mc-button ${variantClass}`;
}
