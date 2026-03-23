import { api } from "../api";
import { createModal } from "../components/modal";
import { createPageHeader } from "../components/page-header";
import { registerKeyboardScope } from "../ui/keyboard-scope.js";
import { registerPageCleanup } from "../utils/page";
import { flattenConfig, prettyJson } from "./config-helpers";
import { createConfigActions } from "./config-actions";
import { handleConfigKeyboard } from "./config-keyboard";
import { renderOverlayPanel, renderSchemaPanel, renderDiffPanel, renderEmptyState } from "./config-panels";
import { createConfigState } from "./config-state";

export function createConfigPage(): HTMLElement {
  const state = createConfigState();
  const page = document.createElement("div");
  page.className = "page config-page fade-in";

  // Header with clear title and actions
  const header = createPageHeader(
    "Configuration",
    "Override settings without modifying your workflow file. Changes persist across restarts.",
  );

  // Help banner that can be dismissed
  const helpBanner = document.createElement("section");
  helpBanner.className = "config-help-banner";
  helpBanner.innerHTML = `
    <div class="config-help-content">
      <div class="config-help-icon">💡</div>
      <div class="config-help-text">
        <strong>New to config overrides?</strong>
        Use dotted paths like <code>tracker.project_slug</code> to override specific settings.
        <a href="#" class="config-help-link" data-action="show-schema">Browse available paths →</a>
      </div>
    </div>
    <button class="config-help-dismiss" aria-label="Dismiss help">×</button>
  `;

  // Dismiss help banner
  helpBanner.querySelector(".config-help-dismiss")?.addEventListener("click", () => {
    helpBanner.classList.add("is-hidden");
    localStorage.setItem("symphony.configHelpDismissed", "true");
  });

  // Show schema link
  helpBanner.querySelector("[data-action='show-schema']")?.addEventListener("click", (e) => {
    e.preventDefault();
    state.showSchema = true;
    render();
  });

  // Check if help was previously dismissed
  if (localStorage.getItem("symphony.configHelpDismissed") === "true") {
    helpBanner.classList.add("is-hidden");
  }

  // Main content area with two-column layout
  const content = document.createElement("section");
  content.className = "config-content";

  // Left: Editor panel (primary focus)
  const editorPanel = document.createElement("div");
  editorPanel.className = "config-editor-panel";

  // Right: Sidebar with schema and diff
  const sidebarPanel = document.createElement("div");
  sidebarPanel.className = "config-sidebar";

  // Schema section (collapsible)
  const schemaSection = document.createElement("div");
  schemaSection.className = "config-sidebar-section";

  // Diff section
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
        state.pathValue = prettyJson(
          path
            .split(".")
            .reduce<unknown>(
              (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
              state.effective,
            ) ?? "",
        );
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
        },
        onRawInput: (value) => {
          state.rawPatch = value;
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
    cancel.className = "mc-button mc-button-ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => modal.close());
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "mc-button mc-button-danger";
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
