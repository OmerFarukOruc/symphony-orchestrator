let container: HTMLElement | null = null;

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastAction {
  label: string;
  onClick: () => void;
}

function getContainer(): HTMLElement {
  if (container) {
    return container;
  }
  container = document.createElement("div");
  container.id = "toast-container";
  container.className = "toast-container";
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "Notifications");
  document.body.append(container);
  return container;
}

export function toast(message: string, type: ToastType, action?: ToastAction): void {
  const item = document.createElement("div");
  item.className = `toast toast-enhanced toast-${type} fade-in`;
  item.setAttribute("role", "status");
  item.setAttribute("aria-live", "polite");
  item.setAttribute("aria-atomic", "true");

  const content = document.createElement("div");
  content.className = "toast-content";

  const messageSpan = document.createElement("span");
  messageSpan.className = "toast-message";
  messageSpan.textContent = message;

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "toast-dismiss";
  dismissButton.setAttribute("aria-label", "Dismiss notification");
  dismissButton.textContent = "×";

  dismissButton.addEventListener("click", (event) => {
    event.stopPropagation();
    removeToast(item);
  });

  item.addEventListener("click", () => {
    removeToast(item);
  });

  if (action) {
    item.className += " toast-with-action";
    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "mc-button is-sm";
    actionBtn.textContent = action.label;
    actionBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      action.onClick();
      removeToast(item);
    });
    content.append(messageSpan, actionBtn);
  } else {
    content.append(messageSpan);
  }

  item.append(content, dismissButton);

  getContainer().append(item);
  window.setTimeout(() => {
    removeToast(item);
  }, 5_000);
}

function removeToast(item: HTMLElement): void {
  if (!item.parentNode || item.classList.contains("is-exiting")) return;
  item.classList.add("is-exiting");
  item.addEventListener(
    "animationend",
    () => {
      item.remove();
    },
    { once: true },
  );
}
