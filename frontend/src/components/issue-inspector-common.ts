import { flashDiff, setTextWithDiff } from "../utils/diff";

export function kv(label: string, value: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "issue-meta-item";
  const caption = document.createElement("span");
  caption.className = "text-secondary";
  caption.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  item.append(caption, strong);
  return item;
}

export function button(label: string, onClick: () => void, variant = "mc-button-ghost"): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `mc-button ${variant}`;
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

export function applyStagger(elements: HTMLElement[]): void {
  elements.forEach((element, index) => {
    element.classList.add("stagger-item");
    element.style.setProperty("--stagger-index", String(index));
  });
}

export function createSummaryStat(label: string): {
  element: HTMLElement;
  update: (value: string) => void;
} {
  const element = document.createElement("div");
  element.className = "issue-summary-item";
  const caption = document.createElement("span");
  caption.className = "text-secondary";
  caption.textContent = label;
  const value = document.createElement("strong");
  element.append(caption, value);
  return {
    element,
    update: (nextValue: string) => {
      const before = value.textContent ?? "";
      setTextWithDiff(value, nextValue);
      if (before && before !== nextValue) {
        flashDiff(element);
      }
    },
  };
}
