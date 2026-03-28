import { api } from "../api";
import { createPageHeader } from "../components/page-header";
import { toast } from "../ui/toast";
import { registerPageCleanup } from "../utils/page";

import { createTemplateEditor, type TemplateEditor } from "./templates-editor";
import { createTemplatesState, type PromptTemplate, type TemplatesState } from "./templates-state";

/* ── Helpers ───────────────────────────────────────────── */

function selectedTemplate(state: TemplatesState): PromptTemplate | undefined {
  return state.templates.find((tpl) => tpl.id === state.selectedId);
}

/* ── DOM builders ──────────────────────────────────────── */

function buildTemplateItem(tpl: PromptTemplate, state: TemplatesState, onSelect: (id: string) => void): HTMLElement {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "template-item";
  if (tpl.id === state.selectedId) {
    item.classList.add("is-selected");
  }

  const nameSpan = document.createElement("span");
  nameSpan.textContent = tpl.name || tpl.id;
  item.append(nameSpan);

  if (tpl.id === state.activeTemplateId) {
    const badge = document.createElement("span");
    badge.className = "template-active-badge";
    badge.textContent = "\u2605";
    badge.title = "Active template";
    item.append(badge);
  }

  item.addEventListener("click", () => onSelect(tpl.id));
  return item;
}

function buildNewForm(state: TemplatesState, onCreated: () => void, formContainer: HTMLElement): void {
  formContainer.replaceChildren();
  formContainer.className = "templates-new-form";

  const idInput = document.createElement("input");
  idInput.type = "text";
  idInput.placeholder = "Template ID (e.g. my-template)";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Display name";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "var(--space-2)";

  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.className = "mc-button is-primary is-sm";
  createBtn.textContent = "Create";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "mc-button is-ghost is-sm";
  cancelBtn.textContent = "Cancel";

  cancelBtn.addEventListener("click", () => {
    state.creating = false;
    formContainer.replaceChildren();
    formContainer.className = "";
  });

  createBtn.addEventListener("click", async () => {
    const id = idInput.value.trim();
    const name = nameInput.value.trim();
    if (!id) {
      toast("Template ID is required", "error");
      return;
    }
    try {
      createBtn.disabled = true;
      await api.createTemplate({ id, name: name || id, body: "" });
      toast("Template created", "success");
      state.creating = false;
      formContainer.replaceChildren();
      formContainer.className = "";
      state.selectedId = id;
      onCreated();
    } catch (error_) {
      toast(`Failed to create template: ${error_ instanceof Error ? error_.message : String(error_)}`, "error");
    } finally {
      createBtn.disabled = false;
    }
  });

  actions.append(createBtn, cancelBtn);
  formContainer.append(idInput, nameInput, actions);
  idInput.focus();
}

function buildPreviewPanel(state: TemplatesState): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "templates-preview";
  if (state.previewError) {
    panel.classList.add("templates-preview-error");
    panel.textContent = state.previewError;
  } else {
    panel.textContent = state.previewOutput || "(empty)";
  }
  return panel;
}

/* ── Main page factory ─────────────────────────────────── */

export function createTemplatesPage(): HTMLElement {
  const state = createTemplatesState();
  let editor: TemplateEditor | null = null;
  let suppressEditorChange = false;

  const page = document.createElement("div");
  page.className = "page templates-page";

  const header = createPageHeader("Prompt Templates", "Manage and preview prompt templates");
  page.append(header);

  const layout = document.createElement("div");
  layout.className = "templates-layout";

  /* ── Left rail ───────────────────────────────── */
  const rail = document.createElement("div");
  rail.className = "templates-rail";

  const listContainer = document.createElement("div");
  listContainer.className = "templates-rail-list";

  const railFooter = document.createElement("div");
  railFooter.className = "templates-rail-footer";

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "mc-button is-ghost is-sm";
  newBtn.textContent = "+ New";

  const newFormContainer = document.createElement("div");

  railFooter.append(newBtn, newFormContainer);
  rail.append(listContainer, railFooter);

  /* ── Right pane ──────────────────────────────── */
  const editorPane = document.createElement("div");
  editorPane.className = "templates-editor";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "templates-name-input";
  nameInput.placeholder = "Template name";

  const cmContainer = document.createElement("div");
  cmContainer.className = "cm-editor-container";

  const actionsBar = document.createElement("div");
  actionsBar.className = "templates-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "mc-button is-primary is-sm";
  saveBtn.textContent = "Save";

  const setActiveBtn = document.createElement("button");
  setActiveBtn.type = "button";
  setActiveBtn.className = "mc-button is-ghost is-sm";
  setActiveBtn.textContent = "Set Active";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "mc-button is-ghost is-sm";
  previewBtn.textContent = "Preview";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "mc-button is-ghost is-sm";
  deleteBtn.style.color = "var(--status-blocked)";
  deleteBtn.textContent = "Delete";

  actionsBar.append(saveBtn, setActiveBtn, previewBtn, deleteBtn);

  const previewPanel = document.createElement("div");

  const emptyState = document.createElement("div");
  emptyState.className = "templates-empty";
  emptyState.textContent = "Select a template or create a new one";

  editorPane.append(nameInput, cmContainer, actionsBar, previewPanel);

  layout.append(rail, editorPane);
  page.append(layout);

  /* ── State helpers ───────────────────────────── */

  function renderRail(): void {
    listContainer.replaceChildren();
    for (const tpl of state.templates) {
      listContainer.append(buildTemplateItem(tpl, state, (id) => selectTemplate(id)));
    }
  }

  function renderEditorPane(): void {
    const tpl = selectedTemplate(state);
    if (!tpl) {
      editorPane.replaceChildren(emptyState);
      return;
    }

    editorPane.replaceChildren(nameInput, cmContainer, actionsBar, previewPanel);
    nameInput.value = state.editorName;

    if (!editor) {
      editor = createTemplateEditor({
        parent: cmContainer,
        initialValue: state.editorBody,
        onChange: (value) => {
          if (suppressEditorChange) return;
          state.editorBody = value;
          state.dirty = true;
        },
      });
    } else {
      suppressEditorChange = true;
      editor.setValue(state.editorBody);
      suppressEditorChange = false;
    }

    renderPreview();
  }

  function renderPreview(): void {
    previewPanel.replaceChildren();
    if (state.showPreview) {
      previewPanel.append(buildPreviewPanel(state));
    }
  }

  function guardDirty(): boolean {
    if (!state.dirty) return true;
    return window.confirm("You have unsaved changes. Discard them?");
  }

  function selectTemplate(id: string): void {
    if (id === state.selectedId) return;
    if (!guardDirty()) return;

    state.selectedId = id;
    const tpl = selectedTemplate(state);
    if (tpl) {
      state.editorName = tpl.name;
      state.editorBody = tpl.body;
    }
    state.dirty = false;
    state.showPreview = false;
    state.previewOutput = "";
    state.previewError = null;

    renderRail();
    renderEditorPane();
  }

  async function loadTemplates(): Promise<void> {
    state.loading = true;
    try {
      const [templatesResult, overlayResult] = await Promise.all([api.getTemplates(), api.getConfigOverlay()]);
      state.templates = templatesResult.templates;
      const overlay = overlayResult.overlay;
      const activeId = overlay["system.selectedTemplateId"];
      state.activeTemplateId = typeof activeId === "string" ? activeId : null;

      renderRail();

      // Auto-select first if nothing selected
      if (!state.selectedId && state.templates.length > 0) {
        selectTemplate(state.templates[0].id);
      } else if (state.selectedId) {
        // Re-render in case the selected template was updated externally
        const tpl = selectedTemplate(state);
        if (tpl) {
          state.editorName = tpl.name;
          state.editorBody = tpl.body;
          state.dirty = false;
          renderEditorPane();
        }
      }

      if (state.templates.length === 0) {
        editorPane.replaceChildren(emptyState);
      }
    } catch (error_) {
      state.error = error_ instanceof Error ? error_.message : String(error_);
      toast(`Failed to load templates: ${state.error}`, "error");
    } finally {
      state.loading = false;
    }
  }

  /* ── Actions ─────────────────────────────────── */

  async function saveTemplate(): Promise<void> {
    const tpl = selectedTemplate(state);
    if (!tpl) return;

    state.saving = true;
    saveBtn.disabled = true;
    try {
      await api.updateTemplate(tpl.id, {
        name: nameInput.value.trim() || tpl.name,
        body: editor?.getValue() ?? state.editorBody,
      });
      state.dirty = false;
      toast("Template saved", "success");
      await loadTemplates();
    } catch (error_) {
      toast(`Save failed: ${error_ instanceof Error ? error_.message : String(error_)}`, "error");
    } finally {
      state.saving = false;
      saveBtn.disabled = false;
    }
  }

  async function setActive(): Promise<void> {
    const tpl = selectedTemplate(state);
    if (!tpl) return;

    setActiveBtn.disabled = true;
    try {
      await api.putConfigOverlay({ "system.selectedTemplateId": tpl.id });
      state.activeTemplateId = tpl.id;
      toast(`"${tpl.name}" set as active template`, "success");
      renderRail();
    } catch (error_) {
      toast(`Failed to set active: ${error_ instanceof Error ? error_.message : String(error_)}`, "error");
    } finally {
      setActiveBtn.disabled = false;
    }
  }

  async function previewTemplate(): Promise<void> {
    const tpl = selectedTemplate(state);
    if (!tpl) return;

    previewBtn.disabled = true;
    try {
      const result = await api.previewTemplate(tpl.id);
      state.previewOutput = result.rendered;
      state.previewError = null;
      state.showPreview = true;
    } catch (error_) {
      state.previewError = error_ instanceof Error ? error_.message : String(error_);
      state.previewOutput = "";
      state.showPreview = true;
    } finally {
      previewBtn.disabled = false;
      renderPreview();
    }
  }

  async function deleteTemplate(): Promise<void> {
    const tpl = selectedTemplate(state);
    if (!tpl) return;

    if (!window.confirm(`Delete template "${tpl.name}"?`)) return;

    state.deleting = true;
    deleteBtn.disabled = true;
    try {
      await api.deleteTemplate(tpl.id);
      toast("Template deleted", "success");
      state.selectedId = null;
      state.dirty = false;
      editor?.destroy();
      editor = null;
      cmContainer.replaceChildren();
      await loadTemplates();
    } catch (error_) {
      toast(`Delete failed: ${error_ instanceof Error ? error_.message : String(error_)}`, "error");
    } finally {
      state.deleting = false;
      deleteBtn.disabled = false;
    }
  }

  /* ── Event wiring ────────────────────────────── */

  nameInput.addEventListener("input", () => {
    state.editorName = nameInput.value;
    state.dirty = true;
  });

  saveBtn.addEventListener("click", () => void saveTemplate());
  setActiveBtn.addEventListener("click", () => void setActive());
  previewBtn.addEventListener("click", () => void previewTemplate());
  deleteBtn.addEventListener("click", () => void deleteTemplate());

  newBtn.addEventListener("click", () => {
    if (state.creating) return;
    state.creating = true;
    buildNewForm(state, () => void loadTemplates(), newFormContainer);
  });

  /* ── Keyboard shortcuts ──────────────────────── */

  function handleKeydown(event: KeyboardEvent): void {
    const modKey = event.metaKey || event.ctrlKey;

    if (modKey && event.key === "s") {
      event.preventDefault();
      void saveTemplate();
    }

    if (modKey && event.shiftKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      void previewTemplate();
    }
  }

  page.addEventListener("keydown", handleKeydown);

  /* ── Cleanup ─────────────────────────────────── */

  registerPageCleanup(page, () => {
    editor?.destroy();
    editor = null;
    page.removeEventListener("keydown", handleKeydown);
  });

  /* ── Init ────────────────────────────────────── */

  void loadTemplates();

  return page;
}
