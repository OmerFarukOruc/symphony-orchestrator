import { createEmptyState } from "../components/empty-state";
import { createButton, createField } from "../components/forms";
import { escapeHtml } from "../utils/escape";
import type { ConfigMode, ConfigState } from "./config-state";
import { buildDiffText, flattenConfig, prettyJson, redactPath, redactValue } from "./config-helpers";

export function renderSchemaPanel(
  container: HTMLElement,
  state: ConfigState,
  actions: {
    onToggle: () => void;
    onSelectPath: (path: string) => void;
  },
): void {
  container.innerHTML = "";

  const header = document.createElement("button");
  header.type = "button";
  header.className = "config-sidebar-header";
  const toggleIcon = state.showSchema ? "−" : "+";
  header.innerHTML = `
    <span class="config-sidebar-title">📋 Available Paths</span>
    <span class="config-sidebar-toggle">${toggleIcon}</span>
  `;
  header.title = state.showSchema ? "Click to collapse" : "Click to expand and view available configuration paths";
  header.addEventListener("click", actions.onToggle);
  container.append(header);

  if (!state.showSchema) {
    const hint = document.createElement("div");
    hint.className = "config-sidebar-hint";
    hint.innerHTML = `<p class="text-secondary">Expand to see common config paths you can override</p>`;
    container.append(hint);
    return;
  }

  const content = document.createElement("div");
  content.className = "config-sidebar-content";

  if (!state.schema) {
    content.append(
      createEmptyState(
        "Schema unavailable",
        "Common config paths:\n• tracker.project_slug\n• codex.sandbox.memory\n• server.port",
      ),
    );
  } else {
    const paths = document.createElement("pre");
    paths.className = "config-schema-code";
    paths.textContent = prettyJson(state.schema);
    content.append(paths);
  }

  container.append(content);
}

export function renderOverlayPanel(
  state: ConfigState,
  actions: {
    onMode: (mode: ConfigMode) => void;
    onFilter: (value: string) => void;
    onSelectPath: (path: string) => void;
    onSavePath: () => void;
    onSaveRaw: () => void;
    onDelete: (path: string) => void;
    onPathInput: (value: string) => void;
    onValueInput: (value: string) => void;
    onRawInput: (value: string) => void;
  },
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "config-editor";

  const modeSelector = document.createElement("div");
  modeSelector.className = "config-mode-selector";

  const modes: { id: ConfigMode; label: string; description: string }[] = [
    { id: "tree", label: "Browse", description: "View all overrides" },
    { id: "path", label: "Add New", description: "Create a new override" },
    { id: "raw", label: "Raw JSON", description: "Edit as JSON" },
  ];

  modes.forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `config-mode-btn ${state.mode === mode.id ? "is-active" : ""}`;
    button.innerHTML = `
      <span class="config-mode-label">${mode.label}</span>
      <span class="config-mode-desc">${mode.description}</span>
    `;
    button.addEventListener("click", () => actions.onMode(mode.id));
    modeSelector.append(button);
  });

  panel.append(modeSelector);

  if (state.mode === "raw") {
    const rawEditor = document.createElement("div");
    rawEditor.className = "config-raw-editor";

    const textarea = Object.assign(document.createElement("textarea"), {
      className: "config-textarea config-textarea-large",
      value: state.rawPatch,
      placeholder: '{"tracker.project_slug": "my-project"}',
    });
    textarea.addEventListener("input", () => actions.onRawInput(textarea.value));

    const saveBtn = createButton(state.saving ? "Saving…" : "Save Changes", "primary");
    saveBtn.disabled = state.saving;
    saveBtn.addEventListener("click", actions.onSaveRaw);

    rawEditor.append(
      createField(
        { label: "Raw JSON Overlay", hint: "Edit the complete overlay as JSON. Arrays replace; objects merge." },
        textarea,
      ),
      saveBtn,
    );
    panel.append(rawEditor);
    return panel;
  }

  const entries = flattenConfig(state.overlay, "overlay").filter(
    (entry) => !state.filter || entry.path.includes(state.filter),
  );

  if (state.mode === "tree" && entries.length > 0) {
    const listSection = document.createElement("div");
    listSection.className = "config-list-section";

    const filterRow = document.createElement("div");
    filterRow.className = "config-filter-row";
    const countLabel = `${entries.length} override${entries.length !== 1 ? "s" : ""}`;
    filterRow.innerHTML = `<span class="config-count">${countLabel}</span>`;

    const filterInput = Object.assign(document.createElement("input"), {
      className: "config-filter-input",
      placeholder: "Filter overrides…",
      value: state.filter,
    });
    filterInput.addEventListener("input", () => actions.onFilter(filterInput.value));
    filterRow.append(filterInput);
    listSection.append(filterRow);

    const list = document.createElement("div");
    list.className = "config-entries-list";

    entries.forEach((entry) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `config-entry-row ${state.selectedPath === entry.path ? "is-selected" : ""}`;
      const valueDisplay = redactPath(entry.path, entry.value);
      const truncatedValue = valueDisplay.length > 40 ? valueDisplay.substring(0, 37) + "…" : valueDisplay;
      const escapedValue = escapeHtml(valueDisplay);
      row.innerHTML = `
        <code class="config-entry-path">${escapeHtml(entry.path)}</code>
        <span class="config-entry-value" title="${escapedValue}">${escapeHtml(truncatedValue)}</span>
      `;
      row.addEventListener("click", () => actions.onSelectPath(entry.path));
      list.append(row);
    });

    listSection.append(list);
    panel.append(listSection);

    if (state.selectedPath) {
      const editorSection = renderPathEditor(state, entries, actions, true);
      panel.append(editorSection);
    }

    return panel;
  }

  if (state.mode === "tree" && entries.length === 0) {
    panel.append(
      renderEmptyState(() => {
        actions.onMode("path");
      }),
    );
    return panel;
  }

  const editorSection = renderPathEditor(state, entries, actions, false);
  panel.append(editorSection);
  return panel;
}

function renderPathEditor(
  state: ConfigState,
  entries: Array<{ path: string; value: unknown }>,
  actions: {
    onPathInput: (value: string) => void;
    onValueInput: (value: string) => void;
    onSavePath: () => void;
    onDelete: (path: string) => void;
  },
  isEditingExisting: boolean,
): HTMLElement {
  const editorSection = document.createElement("div");
  editorSection.className = "config-path-editor";

  if (isEditingExisting) {
    const editingLabel = document.createElement("div");
    editingLabel.className = "config-editing-label";
    editingLabel.innerHTML = `Editing: <code>${escapeHtml(state.selectedPath)}</code>`;
    editorSection.append(editingLabel);
  }

  const pathField = Object.assign(document.createElement("input"), {
    className: "config-input",
    value: state.selectedPath,
    placeholder: "tracker.project_slug",
    readOnly: isEditingExisting,
  });
  pathField.addEventListener("input", () => actions.onPathInput(pathField.value));

  const valueField = Object.assign(document.createElement("textarea"), {
    className: "config-textarea config-textarea-small",
    value: state.pathValue,
    placeholder: '"my-project"  or  4001  or  true',
    rows: 3,
  });
  valueField.addEventListener("input", () => actions.onValueInput(valueField.value));

  const actionsRow = document.createElement("div");
  actionsRow.className = "config-actions-row";

  const isExisting = entries.some((e) => e.path === state.selectedPath);
  const saveLabel = state.saving ? "Saving…" : isExisting ? "Update" : "Save Override";
  const saveBtn = createButton(saveLabel, "primary");
  saveBtn.disabled = state.saving || !state.selectedPath;
  saveBtn.addEventListener("click", actions.onSavePath);

  const deleteBtn = createButton("Remove");
  deleteBtn.disabled = !isExisting;
  deleteBtn.className = "mc-button is-danger";
  deleteBtn.addEventListener("click", () => actions.onDelete(state.selectedPath));

  if (isExisting) {
    actionsRow.append(saveBtn, deleteBtn);
  } else {
    actionsRow.append(saveBtn);
  }

  const pathLabel = isEditingExisting ? "Path (read-only)" : "Setting Path";
  editorSection.append(
    createField({ label: pathLabel, hint: "Use dotted notation: parent.child.value" }, pathField),
    createField({ label: "Value", hint: "JSON values are parsed automatically. Strings need quotes." }, valueField),
    actionsRow,
  );

  return editorSection;
}

export function renderDiffPanel(container: HTMLElement, state: ConfigState): void {
  container.innerHTML = "";

  const overlayCount = Object.keys(flattenConfig(state.overlay, "overlay")).length;

  const header = document.createElement("div");
  header.className = "config-sidebar-header is-static";
  const badgeHtml = overlayCount > 0 ? `<span class="config-badge">${overlayCount}</span>` : "";
  header.innerHTML = `
    <span class="config-sidebar-title">🔍 Changes Preview</span>
    ${badgeHtml}
  `;
  container.append(header);

  const content = document.createElement("div");
  content.className = "config-sidebar-content";

  if (overlayCount === 0) {
    content.innerHTML = `
      <div class="config-empty-changes">
        <span class="config-empty-icon">✓</span>
        <p>No overrides configured</p>
        <span class="text-secondary">Using default settings from workflow file</span>
      </div>
    `;
  } else {
    const diffSection = document.createElement("div");
    diffSection.className = "config-diff-section";
    diffSection.innerHTML = `<h4 class="config-diff-title">Modified values</h4>`;

    const diff = document.createElement("pre");
    diff.className = "config-diff-code";
    diff.textContent = buildDiffText(state.effective, state.overlay);
    diffSection.append(diff);
    content.append(diffSection);

    const effectiveSection = document.createElement("div");
    effectiveSection.className = "config-diff-section";
    effectiveSection.innerHTML = `<h4 class="config-diff-title">Full config (sensitive values hidden)</h4>`;

    const redacted = document.createElement("pre");
    redacted.className = "config-effective-code";
    redacted.textContent = prettyJson(redactValue(state.effective));
    effectiveSection.append(redacted);
    content.append(effectiveSection);
  }

  container.append(content);
}

export function renderEmptyState(onCreate: () => void): HTMLElement {
  const container = document.createElement("div");
  container.className = "config-empty";
  container.innerHTML = `
    <div class="config-empty-icon-large">⚙️</div>
    <h3>No configuration overrides yet</h3>
    <p class="text-secondary">Configuration overrides let you customize Symphony behavior without changing your workflow file.</p>
  `;

  const cta = createButton("Create First Override", "primary");
  cta.addEventListener("click", onCreate);
  container.append(cta);

  return container;
}
