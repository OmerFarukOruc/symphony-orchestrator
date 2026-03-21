function createSkeleton(className: string, size?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = `${className} skeleton`;
  element.setAttribute("aria-hidden", "true");
  if (size) {
    element.style.setProperty(className.includes("line") ? "width" : "height", size);
  }
  return element;
}

export function skeletonLine(width = "100%"): HTMLElement {
  return createSkeleton("skeleton-line", width);
}

export function skeletonBlock(height = "88px"): HTMLElement {
  return createSkeleton("skeleton-block", height);
}

export function skeletonCard(): HTMLElement {
  const card = document.createElement("div");
  card.className = "skeleton-card";
  card.setAttribute("aria-hidden", "true");
  card.append(skeletonLine("42%"), skeletonLine("76%"), skeletonBlock("72px"));
  return card;
}

export function skeletonColumn(): HTMLElement {
  const column = document.createElement("section");
  column.className = "skeleton-column";
  column.setAttribute("aria-hidden", "true");
  column.append(skeletonLine("38%"), skeletonCard(), skeletonCard(), skeletonCard());
  return column;
}

function skeletonLogRows(count = 6): HTMLElement {
  const shell = document.createElement("div");
  shell.className = "skeleton-log-list";
  shell.setAttribute("aria-hidden", "true");
  Array.from({ length: count }).forEach(() => {
    const row = document.createElement("div");
    row.className = "skeleton-log-row";
    row.append(skeletonLine("16%"), skeletonLine("78%"), skeletonBlock("44px"));
    shell.append(row);
  });
  return shell;
}

function skeletonTable(rows = 5): HTMLElement {
  const container = document.createElement("div");
  container.className = "table-responsive";
  container.setAttribute("aria-hidden", "true");

  const table = document.createElement("table");
  table.className = "attempts-table";

  const tbody = document.createElement("tbody");
  Array.from({ length: rows }).forEach(() => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.append(skeletonLine("100%"));
    row.append(cell);
    tbody.append(row);
  });

  table.append(tbody);
  container.append(table);
  return container;
}
