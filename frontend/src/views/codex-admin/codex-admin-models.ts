import { createTableCell, createTableEmptyRow, createTableHead } from "../../ui/table.js";
import type { CodexModelCatalogEntry } from "../../types/codex.js";
import { createPanel } from "./codex-admin-helpers.js";

function describeModelReasoning(model: CodexModelCatalogEntry): string {
  return (
    model.supportedReasoningEfforts?.map((entry) => entry.reasoningEffort).join(", ") ||
    model.defaultReasoningEffort ||
    "\u2014"
  );
}

function describeModelFlags(model: CodexModelCatalogEntry): string {
  return (
    [
      model.isDefault ? "default" : null,
      model.hidden ? "hidden" : null,
      model.supportsPersonality ? "personality" : null,
      model.upgrade ? `upgrade:${model.upgrade}` : null,
    ]
      .filter(Boolean)
      .join(" \u2022 ") || "\u2014"
  );
}

function createModelRow(model: CodexModelCatalogEntry): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.append(
    createTableCell(model.displayName || model.id, { title: model.id }),
    createTableCell(describeModelReasoning(model)),
    createTableCell(model.inputModalities?.join(", ") || "text"),
    createTableCell(describeModelFlags(model)),
  );
  return row;
}

export function renderModelPanel(models: CodexModelCatalogEntry[]): HTMLElement {
  const panel = createPanel(
    "Model catalog",
    "Live app-server model metadata, including default flags, modalities, and supported reasoning efforts.",
  );
  const tableWrap = document.createElement("div");
  tableWrap.className = "codex-admin-table-wrap";
  const table = document.createElement("table");
  table.className = "attempts-table codex-admin-table";
  table.append(createTableHead(["Model", "Reasoning", "Modalities", "Flags"]));
  const body = document.createElement("tbody");
  if (models.length === 0) {
    body.append(createTableEmptyRow("No models returned by the Codex control plane.", 4));
  } else {
    for (const model of models) {
      body.append(createModelRow(model));
    }
  }
  table.append(body);
  tableWrap.append(table);
  panel.append(tableWrap);
  return panel;
}
