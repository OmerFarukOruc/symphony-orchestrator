import { createEmptyState } from "../components/empty-state";
import { createButton, createField } from "../components/forms";
import type { ConfigMode, ConfigState } from "./config-state";
import { buildDiffText, flattenConfig, prettyJson, redactPath, redactValue } from "./config-helpers";

export function renderSchemaRail(rail: HTMLElement, state: ConfigState): void {
  rail.replaceChildren();
  const header = document.createElement("div");
  header.className = "config-rail-card";
  const h2 = document.createElement("h2");
  h2.textContent = "Schema / help";
  const p = document.createElement("p");
  p.className = "text-secondary";
  p.textContent = "Common payload shapes and routes remain visible while you edit the overlay.";
  header.append(h2, p);
  rail.append(header);
  if (!state.schema) {
    rail.append(
      createEmptyState("Schema unavailable", "Falling back to generic editor mode. Safe path edits still work."),
    );
    return;
  }
  const card = document.createElement("div");
  card.className = "config-rail-card";
  const routes = document.createElement("pre");
  routes.className = "config-code";
  routes.textContent = prettyJson(state.schema);
  card.append(routes);
  rail.append(card);
}

export function renderOverlayEditor(
  main: HTMLElement,
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
): void {
  main.replaceChildren();
  const toolbar = document.createElement("section");
  toolbar.className = "mc-toolbar config-toolbar";
  const modes = document.createElement("div");
  modes.className = "mc-actions";
  const modeDescriptions: Record<string, string> = {
    tree: "Browse overlay paths in a tree view",
    path: "Edit a single path and value",
    raw: "Edit the full overlay as raw JSON",
  };
  ["tree", "path", "raw"].forEach((mode) => {
    const button = createButton(mode);
    button.title = modeDescriptions[mode] ?? mode;
    button.classList.toggle("is-primary", state.mode === mode);
    button.addEventListener("click", () => actions.onMode(mode as ConfigMode));
    modes.append(button);
  });
  const filter = Object.assign(document.createElement("input"), {
    className: "mc-input",
    placeholder: "Filter paths…",
    value: state.filter,
  });
  filter.addEventListener("input", () => actions.onFilter(filter.value));
  toolbar.append(modes, filter);
  main.append(toolbar);

  if (state.mode === "raw") {
    const raw = Object.assign(document.createElement("textarea"), {
      className: "mc-textarea config-raw",
      value: state.rawPatch,
    });
    raw.addEventListener("input", () => actions.onRawInput(raw.value));
    const save = createButton(state.saving ? "Saving…" : "Save patch", "primary");
    save.disabled = state.saving;
    save.addEventListener("click", actions.onSaveRaw);
    const panel = document.createElement("section");
    panel.className = "mc-panel form-grid";
    panel.append(
      createField({ label: "Raw JSON patch", hint: "YAML patch mode is represented as JSON for now." }, raw),
      save,
    );
    main.append(panel);
    return;
  }

  const entries = flattenConfig(state.overlay, "overlay").filter(
    (entry) => !state.filter || entry.path.includes(state.filter),
  );
  if (entries.length === 0) {
    main.append(
      createEmptyState(
        "No persistent overrides yet",
        "No saved overlay paths exist yet. Start with a path/value override or switch to raw mode for larger edits.",
        "Switch to path editor",
        () => actions.onMode("path"),
      ),
    );
  } else {
    const list = document.createElement("section");
    list.className = "config-entry-list";
    entries.forEach((entry) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "config-entry mc-panel";
      const pathLabel = document.createElement("strong");
      pathLabel.className = "text-mono";
      pathLabel.textContent = entry.path;
      const valueLabel = document.createElement("span");
      valueLabel.className = "text-secondary";
      valueLabel.textContent = redactPath(entry.path, entry.value);
      row.append(pathLabel, valueLabel);
      row.addEventListener("click", () => actions.onSelectPath(entry.path));
      list.append(row);
    });
    main.append(list);
  }

  const pathInput = Object.assign(document.createElement("input"), {
    className: "mc-input text-mono",
    value: state.selectedPath,
    placeholder: "tracker.project_slug",
  });
  const valueInput = Object.assign(document.createElement("textarea"), {
    className: "mc-textarea config-raw",
    value: state.pathValue,
    placeholder: '"new-value" or 4001 or true',
  });
  pathInput.addEventListener("input", () => actions.onPathInput(pathInput.value));
  valueInput.addEventListener("input", () => actions.onValueInput(valueInput.value));
  const savePath = createButton(state.saving ? "Saving…" : "Save override", "primary");
  savePath.disabled = state.saving;
  savePath.addEventListener("click", actions.onSavePath);
  const deletePath = createButton("Remove path");
  deletePath.disabled = !state.selectedPath;
  deletePath.addEventListener("click", () => actions.onDelete(state.selectedPath));
  const editor = document.createElement("section");
  editor.className = "mc-panel form-grid";
  editor.append(
    createField({ label: "Path" }, pathInput),
    createField({ label: "Value", hint: "JSON values are parsed automatically." }, valueInput),
    savePath,
    deletePath,
  );
  main.append(editor);
}

export function renderDiffPanel(panel: HTMLElement, state: ConfigState): void {
  panel.replaceChildren();
  const box = document.createElement("section");
  box.className = "mc-panel form-grid";
  const diffH2 = document.createElement("h2");
  diffH2.textContent = "Effective config / diff";
  const diffP = document.createElement("p");
  diffP.className = "text-secondary";
  diffP.textContent = "Sensitive paths stay visibly redacted. Every overlay change previews here before you save.";
  box.append(diffH2, diffP);
  const diff = document.createElement("pre");
  diff.className = "config-code";
  diff.textContent = buildDiffText(state.effective, state.overlay);
  const effective = document.createElement("pre");
  effective.className = "config-code";
  effective.textContent = prettyJson(redactValue(state.effective));
  box.append(diff, effective);
  panel.append(box);
}
