import { api } from "../api";
import { createModal } from "../components/modal";
import { createPageHeader } from "../components/page-header";
import { registerKeyboardScope } from "../ui/keyboard-scope.js";
import { registerPageCleanup } from "../utils/page";
import { flattenConfig, prettyJson } from "./config-helpers";
import { getValueAtPath } from "./settings-paths";
import { createConfigActions } from "./config-actions";
import { handleConfigKeyboard } from "./config-keyboard";
import { renderOverlayPanel, renderSchemaPanel, renderDiffPanel, renderEmptyState } from "./config-panels";
import { createConfigState, type ConfigState } from "./config-state";

interface ConfigPageOptions {
  state?: ConfigState;
}

export function createConfigPage(options: ConfigPageOptions = {}): HTMLElement {
  const state = options.state ?? createConfigState();
  const page = document.createElement("div");
  page.className = "page config-page fade-in";

  const header = createPageHeader(
    "Configuration",
    "Override settings without modifying the defaults. Changes persist across restarts.",
  );

  const helpBanner = document.createElement("section");
  helpBanner.className = "config-help-banner";

  const helpContent = document.createElement("div");
  helpContent.className = "config-help-content";

  const helpIcon = document.createElement("div");
  helpIcon.className = "config-help-icon";
  helpIcon.textContent = "\uD83D\uDCA1";

  const helpText = document.createElement("div");
  helpText.className = "config-help-text";
  const helpStrong = document.createElement("strong");
  helpStrong.textContent = "New to config overrides?";
  const helpDescription = document.createTextNode(" Use dotted paths like ");
  const helpCode = document.createElement("code");
  helpCode.textContent = "tracker.project_slug";
  const helpSuffix = document.createTextNode(" to override specific settings. ");
  const helpLink = document.createElement("a");
  helpLink.href = "#";
  helpLink.className = "config-help-link";
  helpLink.dataset.action = "show-schema";
  helpLink.textContent = "Browse available paths \u2192";
  helpText.append(helpStrong, helpDescription, helpCode, helpSuffix, helpLink);

  helpContent.append(helpIcon, helpText);

  const helpDismiss = document.createElement("button");
  helpDismiss.className = "config-help-dismiss";
  helpDismiss.setAttribute("aria-label", "Dismiss help");
  helpDismiss.textContent = "\u00D7";

  helpBanner.append(helpContent, helpDismiss);

  // Dismiss help banner
  helpDismiss.addEventListener("click", () => {
    helpBanner.classList.add("is-hidden");
    localStorage.setItem("risoluto.configHelpDismissed", "true");
  });

  // Show schema link
  helpLink.addEventListener("click", (e) => {
    e.preventDefault();
    state.showSchema = true;
    render();
  });

  if (localStorage.getItem("risoluto.configHelpDismissed") === "true") {
    helpBanner.classList.add("is-hidden");
  }

  const content = document.createElement("section");
  content.className = "config-content";

  const editorPanel = document.createElement("div");
  editorPanel.className = "config-editor-panel";

  const sidebarPanel = document.createElement("div");
  sidebarPanel.className = "config-sidebar";

  const schemaSection = document.createElement("div");
  schemaSection.className = "config-sidebar-section";

  const diffSection = document.createElement("div");
  diffSection.className = "config-sidebar-section";

  sidebarPanel.append(schemaSection, diffSection);
  content.append(editorPanel, sidebarPanel);

  // Delete confirmation modal
  const modal = createModal({
    title: "Remove override",
    description: "This will delete the persistent override. The setting will revert to its default value.",
  });

  page.append(header, helpBanner, content, modal.root);

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
      if (!state.rawPatchDirty) {
        state.rawPatch = prettyJson(state.overlay);
      }
      if (!state.selectedPath) {
        const first = flattenConfig(state.overlay, "overlay")[0]?.path ?? "";
        state.selectedPath = first;
      }
      if (state.selectedPath && !state.pathValueDirty) {
        state.pathValue = prettyJson(getValueAtPath(state.overlay, state.selectedPath) ?? "");
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to load config.";
    } finally {
      state.loading = false;
      render();
    }
  }

  function render(): void {
    // Render main editor panel
    const entries = flattenConfig(state.overlay, "overlay").filter(
      (entry) => !state.filter || entry.path.includes(state.filter),
    );

    if (entries.length === 0 && state.mode === "tree") {
      editorPanel.innerHTML = "";
      editorPanel.append(
        renderEmptyState(() => {
          state.mode = "path";
          render();
        }),
      );
    } else {
      renderOverlayEditor();
    }

    // Render sidebar sections
    renderSchemaPanel(schemaSection, state, {
      onToggle: () => {
        state.showSchema = !state.showSchema;
        render();
      },
      onSelectPath: (path) => {
        state.selectedPath = path;
        state.mode = "path";
        // Extract value from effective config
        state.pathValue = prettyJson(getValueAtPath(state.effective, path) ?? "");
        state.pathValueDirty = false;
        render();
      },
    });

    renderDiffPanel(diffSection, state);
  }

  function renderOverlayEditor(): void {
    editorPanel.innerHTML = "";
    editorPanel.append(
      renderOverlayPanel(state, {
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
          state.pathValue = prettyJson(getValueAtPath(state.overlay, path) ?? "");
          state.pathValueDirty = false;
          render();
        },
        onSavePath: () => {
          actions.savePath().catch(() => {});
        },
        onSaveRaw: () => {
          actions.saveRaw().catch(() => {});
        },
        onDelete: (path) => openDelete(path),
        onPathInput: (value) => {
          state.selectedPath = value;
        },
        onValueInput: (value) => {
          state.pathValue = value;
          state.pathValueDirty = true;
        },
        onRawInput: (value) => {
          state.rawPatch = value;
          state.rawPatchDirty = true;
        },
      }),
    );
  }

  function openDelete(path: string): void {
    if (!path) return;
    modal.body.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "text-secondary",
        textContent: `Remove override at "${path}"?`,
      }),
    );
    modal.footer.replaceChildren();
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "mc-button is-ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => modal.close());
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "mc-button is-danger";
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
        const filter = editorPanel.querySelector(".config-filter-input") as HTMLInputElement | null;
        filter?.focus();
      },
      onNewOverride: () => {
        state.mode = "path";
        state.selectedPath = "";
        state.pathValue = "";
        state.pathValueDirty = false;
        render();
      },
      onDelete: openDelete,
      onSave: () => {
        if (state.mode === "raw") {
          actions.saveRaw().catch(() => {});
        } else {
          actions.savePath().catch(() => {});
        }
      },
      onCloseModal: () => modal.close(),
    });
  }

  registerKeyboardScope(onKey, { scope: page });
  load().catch(() => {});
  registerPageCleanup(page, () => {
    modal.destroy();
  });
  return page;
}
