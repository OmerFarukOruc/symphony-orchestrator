function createSkeleton(className: string, size?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = `${className} skeleton`;
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
  card.append(skeletonLine("42%"), skeletonLine("76%"), skeletonBlock("72px"));
  return card;
}

export function skeletonColumn(): HTMLElement {
  const column = document.createElement("section");
  column.className = "skeleton-column";
  column.append(skeletonLine("38%"), skeletonCard(), skeletonCard(), skeletonCard());
  return column;
}

export function skeletonLogRows(count = 6): HTMLElement {
  const shell = document.createElement("div");
  shell.className = "skeleton-log-list";
  Array.from({ length: count }).forEach(() => {
    const row = document.createElement("div");
    row.className = "skeleton-log-row";
    row.append(skeletonLine("16%"), skeletonLine("78%"), skeletonBlock("44px"));
    shell.append(row);
  });
  return shell;
}
