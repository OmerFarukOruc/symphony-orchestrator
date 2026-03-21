interface KanbanColumnHandle {
  section: HTMLElement;
  label: HTMLElement;
  count: HTMLElement;
  dot: HTMLElement;
  toggle: HTMLButtonElement;
  body: HTMLElement;
}

function normalizeStageKey(key: string): string {
  return key.toLowerCase().replaceAll(" ", "_");
}

export function createKanbanColumn(onToggle: () => void): KanbanColumnHandle {
  const section = document.createElement("section");
  section.className = "kanban-column stagger-item";

  const header = document.createElement("div");
  header.className = "kanban-column-header";

  const dot = document.createElement("span");
  dot.className = "kanban-column-dot";

  const label = document.createElement("span");
  label.className = "kanban-column-label";

  const count = document.createElement("span");
  count.className = "kanban-column-count";

  const actions = document.createElement("div");
  actions.className = "kanban-column-actions";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "kanban-column-toggle";
  toggle.addEventListener("click", onToggle);
  actions.append(toggle);

  header.append(dot, label, count, actions);

  const body = document.createElement("div");
  body.className = "kanban-column-body";

  body.addEventListener("dragover", (event) => {
    event.preventDefault();
    section.classList.add("is-drag-over");
  });
  body.addEventListener("dragenter", (event) => {
    event.preventDefault();
    section.classList.add("is-drag-over");
  });
  body.addEventListener("dragleave", (event) => {
    if (!section.contains(event.relatedTarget as Node)) {
      section.classList.remove("is-drag-over");
    }
  });
  body.addEventListener("drop", (event) => {
    event.preventDefault();
    section.classList.remove("is-drag-over");
    const identifier = event.dataTransfer?.getData("text/plain") ?? "";
    const targetColumnKey = section.dataset.stage ?? "";
    if (!identifier || !targetColumnKey) return;
    section.dispatchEvent(
      new CustomEvent("kanban-drop", {
        bubbles: true,
        detail: { identifier, targetColumnKey },
      }),
    );
  });

  section.append(header, body);
  return { section, label, count, dot, toggle, body };
}

export function applyColumnStage(column: KanbanColumnHandle, key: string): void {
  column.section.dataset.stage = normalizeStageKey(key);
}

export function setDropAllowed(column: KanbanColumnHandle, allowed: boolean): void {
  column.section.classList.toggle("is-drop-forbidden", !allowed);
}

export type { KanbanColumnHandle };
