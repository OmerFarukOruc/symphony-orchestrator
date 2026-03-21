import { createIconSlot } from "./icons";
import {
  createBasePaletteEntries,
  fetchDynamicPaletteEntries,
  filterPaletteEntries,
  type PaletteEntry,
} from "./command-palette-data.js";

let overlayEl: HTMLElement | null = null;
let inputEl: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let activeIndex = 0;
let requestId = 0;
let dynamicEntries: PaletteEntry[] = [];

function resolveRunHistoryPath(): string | null {
  const matchers = [/^\/issues\/([^/]+)\/.+$/, /^\/issues\/([^/]+)$/, /^\/queue\/([^/]+)$/, /^\/logs\/([^/]+)$/];
  for (const matcher of matchers) {
    const match = window.location.pathname.match(matcher);
    if (match?.[1]) {
      return `/issues/${decodeURIComponent(match[1])}/runs`;
    }
  }
  return null;
}

const baseEntries = createBasePaletteEntries({ resolveRunHistoryPath });

function filteredItems(): PaletteEntry[] {
  return filterPaletteEntries([...baseEntries, ...dynamicEntries], inputEl?.value ?? "");
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
  listEl.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "palette-group-header";
    empty.textContent = "No matching routes, issues, PRs, or actions";
    listEl.append(empty);
    return;
  }

  let currentGroup = "";
  items.forEach((item, index) => {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      const groupHeader = document.createElement("div");
      groupHeader.className = "palette-group-header";
      groupHeader.textContent = item.group;
      listEl?.append(groupHeader);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `palette-item transition-base${index === activeIndex ? " is-active" : ""}`;
    const iconSpan = createIconSlot(item.icon, { slotClassName: "palette-item-icon", size: 18 });
    const copyWrap = document.createElement("span");
    copyWrap.style.display = "grid";
    copyWrap.style.gap = "2px";
    const nameSpan = document.createElement("span");
    nameSpan.className = "palette-item-name";
    nameSpan.textContent = item.name;
    const descSpan = document.createElement("span");
    descSpan.className = "palette-item-desc";
    descSpan.textContent = item.description;
    const metaSpan = document.createElement("span");
    metaSpan.className = "palette-meta";
    metaSpan.textContent = item.meta;
    copyWrap.append(nameSpan, descSpan);
    button.append(iconSpan, copyWrap, metaSpan);
    button.addEventListener("click", async () => {
      await item.run();
      closePalette();
    });
    listEl?.append(button);
  });
}

async function refreshDynamicEntries(): Promise<void> {
  const nextRequestId = ++requestId;
  try {
    dynamicEntries = await fetchDynamicPaletteEntries();
  } catch {
    if (nextRequestId !== requestId) {
      return;
    }
    dynamicEntries = [];
  }
  if (nextRequestId === requestId && overlayEl && !overlayEl.hidden) {
    renderList();
  }
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
  void refreshDynamicEntries();
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
      void Promise.resolve(items[activeIndex].run()).finally(() => closePalette());
    }
    if (event.key === "Escape") {
      closePalette();
    }
  });

  document.body.append(overlayEl);
  window.addEventListener("palette:open", () => openPalette());
}
