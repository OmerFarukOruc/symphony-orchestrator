/** Triggers a CSS animation class on an element using double-rAF to avoid forced reflow. */
function flashClass(element: Element, className: string, durationMs: number): void {
  element.classList.remove(className);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.classList.add(className);
      globalThis.setTimeout(() => element.classList.remove(className), durationMs);
    });
  });
}

export function flashDiff(element: Element): void {
  flashClass(element, "diff-flash", 900);
}

export function flashMetric(element: HTMLElement): void {
  flashClass(element, "metric-updated", 300);
}

export function setTextWithDiff(element: HTMLElement, nextValue: string): void {
  if (element.textContent === nextValue) {
    return;
  }
  element.textContent = nextValue;
  flashDiff(element);

  /* Trigger metric pulse for KPI-style value elements */
  if (element.classList.contains("overview-live-value") || element.classList.contains("text-metric")) {
    flashMetric(element);
  }
}
