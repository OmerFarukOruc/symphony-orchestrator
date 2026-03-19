export function createEmptyState(
  title: string,
  detail: string,
  actionLabel?: string,
  onAction?: () => void,
): HTMLElement {
  const box = document.createElement("div");
  box.className = "mc-empty-state";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const text = document.createElement("p");
  text.className = "text-secondary";
  text.textContent = detail;

  box.append(heading, text);
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
