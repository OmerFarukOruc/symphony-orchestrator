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

function clearDropState(section: HTMLElement): void {
  section.classList.remove("is-drag-over", "is-drop-reject");
}

function isDropAllowed(section: HTMLElement): boolean {
  return section.dataset.dropAllowed !== "false";
}

export function createKanbanColumn(onToggle: () => void): KanbanColumnHandle {
  const section = document.createElement("section");
  section.className = "kanban-column stagger-item";
  section.dataset.dropAllowed = "true";

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
    if (!isDropAllowed(section)) {
      clearDropState(section);
      section.classList.add("is-drop-reject");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
      return;
    }
    event.preventDefault();
    clearDropState(section);
    section.classList.add("is-drag-over");
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });
  body.addEventListener("dragenter", (event) => {
    if (!isDropAllowed(section)) {
      clearDropState(section);
      section.classList.add("is-drop-reject");
      return;
    }
    event.preventDefault();
    clearDropState(section);
    section.classList.add("is-drag-over");
  });
  body.addEventListener("dragleave", (event) => {
    if (!section.contains(event.relatedTarget as Node)) {
      clearDropState(section);
    }
  });
  body.addEventListener("drop", (event) => {
    clearDropState(section);
    if (!isDropAllowed(section)) {
      return;
    }
    event.preventDefault();
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
  column.section.dataset.dropAllowed = String(allowed);
  column.section.classList.toggle("is-drop-forbidden", !allowed);
  if (allowed) {
    clearDropState(column.section);
  }
}

export type { KanbanColumnHandle };
