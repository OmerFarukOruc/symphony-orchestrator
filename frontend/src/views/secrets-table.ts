import { createButton } from "../components/forms";
import { createEmptyState } from "../components/empty-state";

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
  table.innerHTML = `<thead><tr><th>Key</th><th>Value</th><th>Actions</th></tr></thead>`;
  const body = document.createElement("tbody");
  keys.forEach((key) => {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.classList.toggle("is-selected", key === selectedKey);
    const keyCell = document.createElement("td");
    keyCell.className = "text-mono";
    keyCell.textContent = key;
    const valueCell = document.createElement("td");
    valueCell.textContent = "Stored once — never shown again";
    const actionsCell = document.createElement("td");
    const copy = createButton("Copy key");
    const remove = createButton("Delete");
    copy.addEventListener("click", () => actions.onCopy(key));
    remove.addEventListener("click", () => actions.onDelete(key));
    actionsCell.append(copy, remove);
    row.append(keyCell, valueCell, actionsCell);
    row.addEventListener("click", () => actions.onSelect(key));
    body.append(row);
  });
  table.append(body);
  container.append(table);
}
