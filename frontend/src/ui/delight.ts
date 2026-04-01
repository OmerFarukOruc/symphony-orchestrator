/**
 * Adds a brief inner flash to primary buttons on click.
 * Communicates "action registered" — calm, not showy.
 * Uses event delegation on the document for efficiency.
 */

const delightTimers = new WeakMap<Element, number>();

export function initDelightClicks(): void {
  document.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest?.(".mc-button.is-primary");
    if (!button || (button as HTMLButtonElement).disabled) return;

    // Clear any pending timer to prevent stale removal on rapid clicks
    const prev = delightTimers.get(button);
    if (prev !== undefined) globalThis.clearTimeout(prev);

    button.classList.remove("delight-click");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        button.classList.add("delight-click");
        const timer = globalThis.setTimeout(() => {
          button.classList.remove("delight-click");
          delightTimers.delete(button);
        }, 300);
        delightTimers.set(button, timer);
      });
    });
  });
}
