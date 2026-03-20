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

  section.append(header, body);
  return { section, label, count, dot, toggle, body };
}

export function applyColumnStage(column: KanbanColumnHandle, key: string): void {
  column.section.dataset.stage = normalizeStageKey(key);
}

export type { KanbanColumnHandle };
