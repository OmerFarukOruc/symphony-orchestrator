let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (container) {
    return container;
  }
  container = document.createElement("div");
  container.id = "toast-container";
  container.className = "toast-container";
  document.body.append(container);
  return container;
}

export function toast(message: string, type: "success" | "error" | "info"): void {
  const item = document.createElement("div");
  item.className = `toast toast-${type} fade-in`;
  item.textContent = message;
  getContainer().append(item);
  window.setTimeout(() => {
    item.remove();
  }, 4_000);
}
