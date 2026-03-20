export interface TableCellOptions {
  className?: string;
  title?: string;
  colSpan?: number;
}

export interface TableRowInteractionOptions {
  ariaSelected?: boolean;
  keyboard?: "enter";
}

export function createTableHeaderCell(label: string): HTMLTableCellElement {
  const cell = document.createElement("th");
  cell.scope = "col";
  cell.textContent = label;
  return cell;
}

export function createTableHead(labels: string[]): HTMLTableSectionElement {
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  labels.forEach((label) => row.append(createTableHeaderCell(label)));
  head.append(row);
  return head;
}

export function createTableCell(text: string, options: TableCellOptions = {}): HTMLTableCellElement {
  const cell = document.createElement("td");
  if (options.className) {
    cell.className = options.className;
  }
  if (options.title) {
    cell.title = options.title;
  }
  if (options.colSpan) {
    cell.colSpan = options.colSpan;
  }
  cell.textContent = text;
  return cell;
}

export function createMonoTableCell(text: string, className = "text-mono"): HTMLTableCellElement {
  return createTableCell(text, { className });
}

export function createTableEmptyRow(message: string, columnCount: number): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.append(createTableCell(message, { className: "table-empty", colSpan: columnCount }));
  return row;
}

export function applyTableRowInteraction(
  row: HTMLTableRowElement,
  onActivate: () => void,
  options: TableRowInteractionOptions = {},
): HTMLTableRowElement {
  row.tabIndex = 0;
  if (options.ariaSelected !== undefined) {
    row.setAttribute("aria-selected", String(options.ariaSelected));
  }
  row.addEventListener("click", onActivate);
  if (options.keyboard === "enter") {
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        onActivate();
      }
    });
  }
  return row;
}
