let container: HTMLElement | null = null;

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

export function toast(
  message: string,
  type: "success" | "error" | "info",
  action?: { label: string; onClick: () => void },
): void {
  const item = document.createElement("div");
  item.className = `toast toast-${type} fade-in`;
  item.setAttribute("role", "status");
  item.setAttribute("aria-live", "polite");

  if (action) {
    item.className += " toast-with-action";
    const messageSpan = document.createElement("span");
    messageSpan.className = "toast-message";
    messageSpan.textContent = message;
    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "mc-button is-sm";
    actionBtn.textContent = action.label;
    actionBtn.addEventListener("click", () => {
      action.onClick();
      removeToast(item);
    });
    item.append(messageSpan, actionBtn);
  } else {
    item.textContent = message;
  }

  getContainer().append(item);
  window.setTimeout(() => {
    removeToast(item);
  }, 5_000);
}

function removeToast(item: HTMLElement): void {
  if (!item.parentNode) return;
  item.classList.add("is-exiting");
  item.addEventListener(
    "animationend",
    () => {
      item.remove();
    },
    { once: true },
  );
}

export function clearToasts(): void {
  getContainer().replaceChildren();
}
