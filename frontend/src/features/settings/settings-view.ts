import { api } from "../../api.js";
import { createEmptyState } from "../../components/empty-state.js";
import { createPageHeader } from "../../components/page-header.js";
import { openProjectPicker } from "../../components/project-picker.js";
import { registerKeyboardScope } from "../../ui/keyboard-scope.js";
import { skeletonBlock } from "../../ui/skeleton.js";
import { toast } from "../../ui/toast.js";
import { createAsyncState, handleError, withLoading } from "../../utils/async-state.js";
import { renderAsyncState } from "../../utils/render-guards.js";

import { buildSettingsSections, getSectionById, sectionVisibleInMode } from "./settings-helpers.js";
import { createSettingsKeyboardHandler } from "./settings-keyboard.js";
import { buildSectionPatchPlan } from "./settings-patches.js";
import { createSettingsState, type SettingsState } from "./settings-state.js";
import {
  isSettingsPageData,
  renderLoadedSettings,
  type SettingsPageData,
  updateSettingsHeader,
} from "./settings-view-render.js";

interface SettingsPageOptions {
  state?: SettingsState;
}

export function createSettingsPage(options: SettingsPageOptions = {}): HTMLElement {
  const state = options.state ?? createSettingsState();
  const loadState = createAsyncState<SettingsPageData>();
  const page = document.createElement("div");
  page.className = "page settings-page fade-in";
  const schemaBadge = document.createElement("span");
  schemaBadge.className = "mc-badge";
  const header = createPageHeader("Settings", "", { actions: schemaBadge });
  const subtitleElement = header.querySelector(".page-subtitle");
  if (!(subtitleElement instanceof HTMLElement)) {
    throw new TypeError("Settings page header is missing a subtitle element.");
  }
  const subtitle = subtitleElement;
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

  async function load(): Promise<void> {
    loadState.error = null;
    state.error = null;
    try {
      loadState.data = await withLoading(
        loadState,
        async () => {
          const [effective, overlayResponse, schema] = await Promise.all([
            api.getConfig(),
            api.getConfigOverlay(),
            api.getConfigSchema().catch(() => null),
          ]);
          return {
            effective,
            overlay: overlayResponse.overlay,
            schema: isSettingsPageData(schema) ? schema : null,
          };
        },
        { onChange: render },
      );
    } catch (error) {
      handleError(loadState, error, "Failed to load settings.");
    }
    render();
  }

  async function saveSection(sectionId: string): Promise<void> {
    if (!loadState.data) {
      return;
    }
    const section = getSectionById(state.schema, state.effective, sectionId);
    if (!section || state.savingSectionId) {
      return;
    }
    const drafts = state.drafts[section.id] ?? {};
    const plan = buildSectionPatchPlan(section, drafts, state.effective);
    if (plan.errors.length > 0) {
      const message = plan.errors.map((error) => error.message).join(" ");
      state.error = message;
      toast(message, "error");
      render();
      return;
    }
    if (!plan.entries.length) {
      toast(`No changes to save for ${section.title}.`, "info");
      return;
    }
    state.savingSectionId = section.id;
    state.error = null;
    render();
    try {
      await api.putConfigOverlay({ patch: plan.patch });
      toast(`${section.title} updated.`, "success");
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to save ${section.title}.`;
      state.error = message;
      toast(message, "error");
    } finally {
      state.savingSectionId = null;
      render();
    }
  }

  function currentVisibleSectionId(): string {
    const sections = buildSettingsSections(state.schema, state.effective);
    return sections.some((section) => section.id === state.selectedSectionId)
      ? state.selectedSectionId
      : (sections[0]?.id ?? state.selectedSectionId);
  }

  function render(): void {
    updateSettingsHeader(subtitle, schemaBadge, state, loadState);
    renderAsyncState(shell, loadState, {
      isEmpty: (data) => buildSettingsSections(data.schema, data.effective).length === 0,
      renderLoading: () => skeletonBlock("320px"),
      renderError: (error) => createEmptyState("Could not load settings", error, "Retry", () => void load()),
      renderEmpty: () =>
        createEmptyState(
          "No settings available yet",
          "Risoluto has not returned any editable settings. This usually resolves after the backend finishes initializing.",
          "Retry",
          () => void load(),
        ),
      renderContent: (data) =>
        renderLoadedSettings(rail, content, searchInput, state, data, {
          onFilter: (value) => {
            state.filter = value;
            render();
            searchInput.focus();
          },
          onSelectSection: (sectionId) => {
            state.selectedSectionId = sectionId;
            // No re-render needed — all sections are already visible.
            // Rail highlight is managed by IntersectionObserver + click handlers.
          },
          onToggleDiff: (sectionId) => {
            if (state.expandedDiffs.has(sectionId)) {
              state.expandedDiffs.delete(sectionId);
            } else {
              state.expandedDiffs.add(sectionId);
            }
            state.selectedSectionId = sectionId;
            render();
          },
          onTogglePaths: (sectionId) => {
            if (state.expandedPaths.has(sectionId)) {
              state.expandedPaths.delete(sectionId);
            } else {
              state.expandedPaths.add(sectionId);
            }
            state.selectedSectionId = sectionId;
            render();
          },
          onSaveSection: (sectionId) => void saveSection(sectionId),
          onSetMode: (mode) => {
            state.mode = mode;
            localStorage.setItem("risoluto.settingsMode", mode);
            // If current section is now hidden, fall back to first visible
            const sections = buildSettingsSections(state.schema, state.effective);
            const visible = sections.filter((s) => sectionVisibleInMode(s, mode));
            if (!visible.some((s) => s.id === state.selectedSectionId)) {
              state.selectedSectionId = visible[0]?.id ?? "tracker";
            }
            render();
          },
          onBrowseLinearProjects: (fieldPath) => {
            openProjectPicker({
              onSelect: (slugId) => {
                const trackerDrafts = state.drafts["tracker"] ?? {};
                state.drafts["tracker"] = trackerDrafts;
                trackerDrafts[fieldPath] = slugId;
                render();
                toast(`Project slug set to ${slugId}`, "success");
              },
            });
          },
        }),
    });
  }

  registerKeyboardScope(
    createSettingsKeyboardHandler({
      onFocusSearch: () => searchInput.focus(),
      onSaveCurrentSection: () => void saveSection(currentVisibleSectionId()),
    }),
    { ignoreInputs: false, scope: page },
  );
  render();
  void load();
  return page;
}
