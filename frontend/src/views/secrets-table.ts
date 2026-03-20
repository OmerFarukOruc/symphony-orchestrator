import { createButton } from "../components/forms";
import { createEmptyState } from "../components/empty-state";
import { applyTableRowInteraction, createMonoTableCell, createTableCell, createTableHead } from "../ui/table";

export function renderSecretsTable(
  container: HTMLElement,
  keys: string[],
  selectedKey: string,
  actions: {
    onSelect: (key: string) => void;
    onCopy: (key: string) => void;
    onDelete: (key: string) => void;
  },
): void {
  container.replaceChildren();
  if (keys.length === 0) {
    container.append(
      createEmptyState(
        "No secrets stored",
        "Values are encrypted at rest and never returned after save. Add a key when you're ready.",
      ),
    );
    return;
  }
  const table = document.createElement("table");
  table.className = "attempts-table";
  const head = createTableHead(["Key", "Value", "Actions"]);
  const body = document.createElement("tbody");
  keys.forEach((key) => {
    const row = document.createElement("tr");
    row.classList.toggle("is-selected", key === selectedKey);
    const keyCell = createMonoTableCell(key);
    const valueCell = createTableCell("Stored once — never shown again");
    const actionsCell = document.createElement("td");
    const copy = createButton("Copy key");
    const remove = createButton("Delete");
    copy.addEventListener("click", () => actions.onCopy(key));
    remove.addEventListener("click", () => actions.onDelete(key));
    actionsCell.append(copy, remove);
    row.append(keyCell, valueCell, actionsCell);
    applyTableRowInteraction(row, () => actions.onSelect(key));
    body.append(row);
  });
  table.append(head, body);
  container.append(table);
}
