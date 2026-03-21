function visibleElementChildren(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && !child.hidden,
  );
}

function shouldReveal(element: HTMLElement): boolean {
  return !element.classList.contains("page-motion-skip") && element.getAttribute("aria-hidden") !== "true";
}

export function decoratePageRoot<T extends HTMLElement>(root: T): T {
  root.classList.add("page-enter");

  let index = 0;
  for (const child of visibleElementChildren(root)) {
    if (!shouldReveal(child)) {
      continue;
    }
    child.classList.add("stagger-item", "page-auto-stagger");
    child.style.setProperty("--stagger-index", String(index));
    index += 1;
  }

  return root;
}
