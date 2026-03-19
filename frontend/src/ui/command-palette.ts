import { router } from "../router";
import { navItems } from "./nav-items";

let overlayEl: HTMLElement | null = null;
let inputEl: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let activeIndex = 0;

function filteredItems() {
  const query = inputEl?.value.trim().toLowerCase() ?? "";
  return navItems.filter((item) => item.name.toLowerCase().includes(query));
}

function closePalette(): void {
  if (!overlayEl) {
    return;
  }
  overlayEl.hidden = true;
}

function renderList(): void {
  if (!listEl) {
    return;
  }
  const items = filteredItems();
  activeIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));
  listEl.innerHTML = "";
  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `palette-item transition-base${index === activeIndex ? " is-active" : ""}`;
    button.innerHTML = `<span class="palette-item-icon" aria-hidden="true">${item.icon}</span><span>${item.name}</span><span class="palette-meta">${item.hotkey}</span>`;
    button.addEventListener("click", () => {
      router.navigate(item.path);
      closePalette();
    });
    listEl?.append(button);
  });
}

function openPalette(): void {
  if (!overlayEl || !inputEl) {
    return;
  }
  overlayEl.hidden = false;
  inputEl.value = "";
  activeIndex = 0;
  renderList();
  inputEl.focus();
}

export function initCommandPalette(): void {
  overlayEl = document.createElement("div");
  overlayEl.className = "palette-overlay fade-in";
  overlayEl.hidden = true;

  const panel = document.createElement("div");
  panel.className = "palette-panel";
  inputEl = document.createElement("input");
  inputEl.className = "palette-input";
  inputEl.placeholder = "Jump to route or action";
  inputEl.addEventListener("input", () => {
    activeIndex = 0;
    renderList();
  });

  listEl = document.createElement("div");
  listEl.className = "palette-list";
  panel.append(inputEl, listEl);
  overlayEl.append(panel);
  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) {
      closePalette();
    }
  });
  overlayEl.addEventListener("keydown", (event) => {
    const items = filteredItems();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      renderList();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderList();
    }
    if (event.key === "Enter" && items[activeIndex]) {
      router.navigate(items[activeIndex].path);
      closePalette();
    }
    if (event.key === "Escape") {
      closePalette();
    }
  });

  document.body.append(overlayEl);
  window.addEventListener("palette:open", () => openPalette());
}
