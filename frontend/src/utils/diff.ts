export function flashDiff(element: Element): void {
  element.classList.remove("diff-flash");
  if (element instanceof HTMLElement) {
    void element.offsetWidth;
  }
  element.classList.add("diff-flash");
  window.setTimeout(() => element.classList.remove("diff-flash"), 900);
}

export function setTextWithDiff(element: HTMLElement, nextValue: string): void {
  if (element.textContent === nextValue) {
    return;
  }
  element.textContent = nextValue;
  flashDiff(element);
}

export function setAttributeWithDiff(element: HTMLElement, name: string, nextValue: string): void {
  if (element.getAttribute(name) === nextValue) {
    return;
  }
  element.setAttribute(name, nextValue);
  flashDiff(element);
}
