import { createModal, type ModalController } from "../components/modal.js";

interface ShortcutItem {
  keys: string;
  description: string;
}

interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "Global",
    items: [
      { keys: "?", description: "Open keyboard shortcuts help" },
      { keys: "Ctrl/Cmd + K", description: "Open the command palette" },
      { keys: "g then o / q", description: "Jump to Overview or Board" },
      { keys: "g then c / s / ,", description: "Jump to Config, Credentials, or Settings" },
      { keys: "g then m / n / g / d / w", description: "Jump to Observe pages" },
      { keys: "g then r", description: "Open runs for the current issue context" },
      { keys: "Esc", description: "Close the active overlay or modal" },
    ],
  },
  {
    title: "Board",
    items: [
      { keys: "/", description: "Focus board search" },
      { keys: "f", description: "Focus board filters" },
      { keys: "[ / ]", description: "Move across columns" },
      { keys: "j / k", description: "Move between issue cards" },
      { keys: "Enter", description: "Open the focused issue" },
      { keys: "Shift + Enter", description: "Open the focused issue in full page view" },
    ],
  },
  {
    title: "Editor",
    items: [
      { keys: "Ctrl/Cmd + Enter", description: "Save the active form or section" },
      { keys: "n", description: "Create a new override or secret where supported" },
      { keys: "Delete", description: "Remove the selected item where supported" },
      { keys: "r", description: "Refresh observability data" },
      { keys: "x", description: "Toggle the observability raw drawer" },
    ],
  },
];

let modal: ModalController | null = null;

function createKeyBadge(text: string): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "mc-badge is-sm";
  badge.textContent = text;
  badge.style.justifySelf = "start";
  badge.style.padding = "2px 8px";
  badge.style.borderRadius = "999px";
  badge.style.color = "var(--color-copper-100)";
  badge.style.background = "color-mix(in srgb, var(--color-copper-500) 82%, transparent)";
  badge.style.borderColor = "color-mix(in srgb, var(--color-copper-400) 55%, transparent)";
  return badge;
}

function createBody(): HTMLElement {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "var(--space-4)";

  for (const section of SECTIONS) {
    const panel = document.createElement("section");
    panel.className = "mc-panel";
    panel.style.display = "grid";
    panel.style.gap = "var(--space-3)";
    panel.style.padding = "var(--space-4)";

    const title = document.createElement("h3");
    title.className = "text-title-3";
    title.textContent = section.title;

    const list = document.createElement("div");
    list.style.display = "grid";
    list.style.gap = "var(--space-2)";

    for (const item of section.items) {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "minmax(156px, auto) 1fr";
      row.style.gap = "var(--space-3)";
      row.style.alignItems = "center";

      const description = document.createElement("span");
      description.className = "text-secondary";
      description.textContent = item.description;

      row.append(createKeyBadge(item.keys), description);
      list.append(row);
    }

    panel.append(title, list);
    body.append(panel);
  }

  return body;
}

function getModal(): ModalController {
  if (modal) {
    return modal;
  }

  modal = createModal({
    title: "Keyboard shortcuts",
    description: "Global navigation, command palette access, and page-specific actions.",
    size: "lg",
  });
  modal.body.append(createBody());

  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.className = "mc-button mc-button-ghost";
  doneButton.textContent = "Done";
  doneButton.addEventListener("click", () => modal?.close());
  modal.footer.append(doneButton);
  document.body.append(modal.root);
  return modal;
}

export function openShortcutHelp(): void {
  getModal().open();
}
