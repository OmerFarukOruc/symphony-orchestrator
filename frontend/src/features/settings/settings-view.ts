import { createEmptyState } from "../../components/empty-state.js";
import { createPageHeader } from "../../components/page-header.js";
import { openProjectPicker } from "../../components/project-picker.js";
import { registerKeyboardScope } from "../../ui/keyboard-scope.js";
import { skeletonBlock } from "../../ui/skeleton.js";
import { renderAsyncState } from "../../utils/render-guards.js";

import { buildSettingsSections } from "./settings-helpers.js";
import { createSettingsKeyboardHandler } from "./settings-keyboard.js";
import { createSettingsWorkbench, type SettingsWorkbench } from "./settings-workbench.js";
import { renderLoadedSettings, updateSettingsHeader } from "./settings-view-render.js";

interface SettingsPageOptions {
  workbench?: SettingsWorkbench;
}

export function createSettingsPage(options: SettingsPageOptions = {}): HTMLElement {
  const page = document.createElement("div");
  page.className = "page settings-page fade-in";
  const schemaBadge = document.createElement("span");
  schemaBadge.className = "mc-badge";
  const header = createPageHeader("Settings", "", { actions: schemaBadge });
  const subtitle =
    header.querySelector<HTMLElement>(".page-subtitle") ??
    (() => {
      const text = header.querySelector<HTMLElement>(".page-header-text");
      if (!(text instanceof HTMLElement)) {
        throw new TypeError("Settings page header is missing a text wrapper.");
      }
      const subtitleElement = document.createElement("p");
      subtitleElement.className = "page-subtitle";
      text.append(subtitleElement);
      return subtitleElement;
    })();
  const shell = document.createElement("section");
  shell.className = "settings-layout";
  const rail = document.createElement("aside");
  rail.className = "settings-rail";
  const content = document.createElement("div");
  content.className = "settings-content";
  const searchInput = Object.assign(document.createElement("input"), {
    className: "mc-input",
    placeholder: "Search sections, fields, or values…",
  });
  searchInput.setAttribute("aria-label", "Search sections, fields, or values");
  shell.append(rail, content);
  page.append(header, shell);

  const workbench = options.workbench ?? createSettingsWorkbench();
  const { state, loadState } = workbench;
  workbench.subscribe(render);

  function render(): void {
    updateSettingsHeader(subtitle, schemaBadge, state, loadState);
    renderAsyncState(shell, loadState, {
      isEmpty: (data) => buildSettingsSections(data.schema, data.effective).length === 0,
      renderLoading: () => skeletonBlock("320px"),
      renderError: (error) => createEmptyState("Could not load settings", error, "Retry", () => void workbench.load()),
      renderEmpty: () =>
        createEmptyState(
          "No settings available yet",
          "Risoluto has not returned any editable settings. This usually resolves after the backend finishes initializing.",
          "Retry",
          () => void workbench.load(),
        ),
      renderContent: (data) =>
        renderLoadedSettings(rail, content, searchInput, state, data, {
          onFilter: (value) => {
            workbench.setFilter(value);
            searchInput.focus();
          },
          onSelectSection: workbench.selectSection,
          onToggleDiff: workbench.toggleDiff,
          onTogglePaths: workbench.togglePaths,
          onSaveSection: (sectionId) => void workbench.saveSection(sectionId),
          onRevertSection: workbench.revertSection,
          onSetMode: workbench.setMode,
          onDraftChange: workbench.setDraftValue,
          onFocusSection: workbench.focusSection,
          onBrowseLinearProjects: (fieldPath) => {
            openProjectPicker({
              onSelect: (slugId) => {
                workbench.setLinearProject(fieldPath, slugId);
              },
            });
          },
        }),
    });
  }

  registerKeyboardScope(
    createSettingsKeyboardHandler({
      onFocusSearch: () => searchInput.focus(),
      onSaveCurrentSection: () => void workbench.saveSection(workbench.currentVisibleSectionId()),
    }),
    { ignoreInputs: false, scope: page },
  );
  render();
  void workbench.load();
  return page;
}
