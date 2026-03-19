import { api } from "../api";
import { createModal } from "../components/modal";
import { registerPageCleanup } from "../utils/page";
import { flattenConfig, prettyJson } from "./config-helpers";
import { createConfigActions } from "./config-actions";
import { handleConfigKeyboard } from "./config-keyboard";
import { renderDiffPanel, renderOverlayEditor, renderSchemaRail } from "./config-panels";
import { createConfigState } from "./config-state";

export function createConfigPage(): HTMLElement {
  const state = createConfigState();
  const page = document.createElement("div");
  page.className = "page config-page fade-in";
  const header = document.createElement("section");
  header.className = "mc-strip";
  header.innerHTML = `<div><h1 class="page-title">Config overlay</h1><p class="page-subtitle">Three-panel operator view for safe overrides, schema hints, and effective config diffing.</p></div>`;
  const layout = document.createElement("section");
  layout.className = "config-layout";
  const rail = document.createElement("aside");
  rail.className = "config-column";
  const editor = document.createElement("main");
  editor.className = "config-column";
  const diff = document.createElement("aside");
  diff.className = "config-column";
  const modal = createModal({
    title: "Remove overlay path",
    description: "This only deletes the persistent override, not the effective default.",
  });
  layout.append(rail, editor, diff);
  page.append(header, layout, modal.root);
  const actions = createConfigActions(state, render, load);

  async function load(): Promise<void> {
    state.loading = true;
    state.error = null;
    render();
    try {
      const [effective, overlayResponse, schema] = await Promise.all([
        api.getConfig(),
        api.getConfigOverlay(),
        api.getConfigSchema().catch(() => null),
      ]);
      state.effective = effective;
      state.overlay = overlayResponse.overlay;
      state.schema = (schema as Record<string, unknown> | null) ?? null;
      state.rawPatch = prettyJson(state.overlay);
      if (!state.selectedPath) {
        const first = flattenConfig(state.overlay, "overlay")[0]?.path ?? "";
        state.selectedPath = first;
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to load config.";
    } finally {
      state.loading = false;
      render();
    }
  }

  function render(): void {
    renderSchemaRail(rail, state);
    renderOverlayEditor(editor, state, {
      onMode: (mode) => {
        state.mode = mode;
        render();
      },
      onFilter: (value) => {
        state.filter = value;
        render();
      },
      onSelectPath: (path) => {
        state.selectedPath = path;
        state.pathValue = prettyJson(
          path
            .split(".")
            .reduce<unknown>(
              (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
              state.overlay,
            ) ?? "",
        );
        render();
      },
      onSavePath: () => void actions.savePath(),
      onSaveRaw: () => void actions.saveRaw(),
      onDelete: (path) => openDelete(path),
      onPathInput: (value) => {
        state.selectedPath = value;
      },
      onValueInput: (value) => {
        state.pathValue = value;
      },
      onRawInput: (value) => {
        state.rawPatch = value;
      },
    });
    renderDiffPanel(diff, state);
  }

  function openDelete(path: string): void {
    if (!path) {
      return;
    }
    modal.body.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "text-secondary",
        textContent: `Remove persistent override at ${path}?`,
      }),
    );
    modal.footer.replaceChildren();
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "mc-button mc-button-ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => modal.close());
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "mc-button mc-button-ghost is-primary";
    confirm.textContent = "Remove";
    confirm.addEventListener("click", async () => {
      await actions.deletePath(path);
      modal.close();
    });
    modal.footer.append(cancel, confirm);
    modal.open();
  }

  function onKey(event: KeyboardEvent): void {
    handleConfigKeyboard(event, {
      selectedPath: state.selectedPath,
      modalOpen: modal.isOpen(),
      onFocusFilter: () => {
        const filter = editor.querySelector(".config-toolbar .mc-input") as HTMLInputElement | null;
        filter?.focus();
      },
      onNewOverride: () => {
        state.mode = "path";
        render();
      },
      onDelete: openDelete,
      onSave: () => {
        if (state.mode === "raw") void actions.saveRaw();
        else void actions.savePath();
      },
      onCloseModal: () => modal.close(),
    });
  }

  window.addEventListener("keydown", onKey);
  void load();
  registerPageCleanup(page, () => {
    modal.destroy();
    window.removeEventListener("keydown", onKey);
  });
  return page;
}
