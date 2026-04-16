import { createTableCell, createTableEmptyRow, createTableHead } from "../../ui/table.js";
import type { CodexCollaborationModeEntry, CodexFeatureEntry } from "../../types/codex.js";
import { createPanel } from "./codex-admin-helpers.js";

export function renderDiagnosticsPanel(
  features: CodexFeatureEntry[],
  collaborationModes: CodexCollaborationModeEntry[],
): HTMLElement {
  const panel = createPanel(
    "Diagnostics",
    "Experimental features and collaboration presets exposed by the connected Codex build.",
  );
  const grid = document.createElement("div");
  grid.className = "codex-admin-diagnostics";

  grid.append(renderFeatureSection(features));
  grid.append(renderModesSection(collaborationModes));
  panel.append(grid);
  return panel;
}

function renderFeatureSection(features: CodexFeatureEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "codex-admin-diagnostics-section";
  const title = document.createElement("h3");
  title.textContent = "Experimental features";
  section.append(title);

  const tableWrap = document.createElement("div");
  tableWrap.className = "codex-admin-table-wrap";
  const table = document.createElement("table");
  table.className = "attempts-table codex-admin-table";
  table.append(createTableHead(["Feature", "Stage", "State"]));
  const body = document.createElement("tbody");
  if (features.length === 0) {
    body.append(createTableEmptyRow("No experimental features reported.", 3));
  } else {
    for (const feature of features) {
      const row = document.createElement("tr");
      const state = feature.enabled ? "Enabled" : feature.defaultEnabled ? "Default on" : "Disabled";
      row.append(
        createTableCell(feature.displayName || feature.name, {
          title: feature.description || feature.announcement || feature.name,
        }),
        createTableCell(feature.stage || "\u2014"),
        createTableCell(state),
      );
      body.append(row);
    }
  }
  table.append(body);
  tableWrap.append(table);
  section.append(tableWrap);
  return section;
}

function renderModesSection(collaborationModes: CodexCollaborationModeEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "codex-admin-diagnostics-section";
  const title = document.createElement("h3");
  title.textContent = "Collaboration modes";
  section.append(title);

  const tableWrap = document.createElement("div");
  tableWrap.className = "codex-admin-table-wrap";
  const table = document.createElement("table");
  table.className = "attempts-table codex-admin-table";
  table.append(createTableHead(["Mode", "Description"]));
  const body = document.createElement("tbody");
  if (collaborationModes.length === 0) {
    body.append(createTableEmptyRow("No collaboration modes reported.", 2));
  } else {
    for (const mode of collaborationModes) {
      const row = document.createElement("tr");
      row.append(
        createTableCell(mode.displayName || mode.name || mode.id || "Unnamed mode"),
        createTableCell(mode.description || "\u2014"),
      );
      body.append(row);
    }
  }
  table.append(body);
  tableWrap.append(table);
  section.append(tableWrap);
  return section;
}
