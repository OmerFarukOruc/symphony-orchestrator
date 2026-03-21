import { createEmptyState } from "../components/empty-state";

import {
  buildSectionDiffPreview,
  buildUnderlyingPaths,
  ensureSectionDrafts,
  sectionMatchesFilter,
  type SettingsSectionDefinition,
} from "./settings-helpers";
import { createSectionAction, createSettingsField } from "./settings-forms";
import type { SettingsState } from "./settings-state";

interface SettingsRenderOptions {
  onFilter: (value: string) => void;
  onSelectSection: (sectionId: string) => void;
  onToggleDiff: (sectionId: string) => void;
  onTogglePaths: (sectionId: string) => void;
  onSaveSection: (sectionId: string) => void;
  /** Called when a field-level action button is clicked (e.g. "Browse" for project slug). */
  onFieldAction?: (sectionId: string, fieldPath: string, actionKind: string) => void;
}

export function renderSettingsLayout(
  rail: HTMLElement,
  content: HTMLElement,
  searchInput: HTMLInputElement,
  state: SettingsState,
  sections: SettingsSectionDefinition[],
  options: SettingsRenderOptions,
): SettingsSectionDefinition[] {
  const visibleSections = sections.filter((section) =>
    sectionMatchesFilter(section, state.filter, state.drafts[section.id]),
  );
  renderRail(rail, visibleSections, state, options);
  renderContent(content, searchInput, visibleSections, state, options);
  return visibleSections;
}

function renderRail(
  rail: HTMLElement,
  sections: SettingsSectionDefinition[],
  state: SettingsState,
  options: SettingsRenderOptions,
): void {
  rail.replaceChildren();
  const card = document.createElement("section");
  card.className = "mc-panel settings-rail-card";
  const railH2 = document.createElement("h2");
  railH2.textContent = "Sections";
  const railP = document.createElement("p");
  railP.className = "text-secondary";
  railP.textContent = "Grouped for operators first, advanced knobs after that.";
  card.append(railH2, railP);
  sections.forEach((section) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mc-rail-item settings-rail-item";
    button.classList.toggle("is-selected", section.id === state.selectedSectionId);
    const btnTitle = document.createElement("strong");
    btnTitle.textContent = section.title;
    const btnBadge = document.createElement("span");
    btnBadge.className = "mc-badge";
    btnBadge.textContent = section.badge;
    button.append(btnTitle, btnBadge);
    button.addEventListener("click", () => options.onSelectSection(section.id));
    card.append(button);
  });
  rail.append(card);
}

function renderContent(
  content: HTMLElement,
  searchInput: HTMLInputElement,
  sections: SettingsSectionDefinition[],
  state: SettingsState,
  options: SettingsRenderOptions,
): void {
  content.replaceChildren();
  const toolbar = document.createElement("section");
  toolbar.className = "mc-toolbar settings-toolbar";
  const hint = document.createElement("span");
  hint.className = "text-secondary";
  hint.textContent = "Press / to search, Cmd/Ctrl+Enter to save the current section.";
  searchInput.value = state.filter;
  searchInput.oninput = () => options.onFilter(searchInput.value);
  toolbar.append(searchInput, hint);
  content.append(toolbar);
  if (state.error) {
    const error = document.createElement("div");
    error.className = "form-error";
    error.textContent = state.error;
    content.append(error);
  }
  if (!sections.length) {
    content.append(
      createEmptyState(
        "No settings match that search",
        "No editable settings matched the current search. Try a broader keyword such as model, sandbox, or tracker.",
        "Clear search",
        () => options.onFilter(""),
      ),
    );
    return;
  }
  const stack = document.createElement("div");
  stack.className = "settings-stack";
  sections.forEach((section) => {
    const drafts = ensureSectionDrafts(state.drafts, section, state.effective);
    const card = document.createElement("section");
    card.className = "mc-panel settings-card";
    card.classList.toggle("is-selected", section.id === state.selectedSectionId);
    card.id = `settings-${section.id}`;
    const header = document.createElement("div");
    header.className = "settings-card-header";
    const headerWrap = document.createElement("div");
    const headerH2 = document.createElement("h2");
    headerH2.textContent = section.title;
    const headerP = document.createElement("p");
    headerP.className = "text-secondary";
    headerP.textContent = section.description;
    headerWrap.append(headerH2, headerP);
    header.append(headerWrap);
    const badge = document.createElement("span");
    badge.className = "mc-badge";
    badge.textContent = section.badge;
    header.append(badge);
    const grid = document.createElement("div");
    grid.className = "form-grid columns-2 settings-grid";
    section.fields.forEach((field) => {
      grid.append(
        createSettingsField(field, {
          value: drafts[field.path] ?? "",
          onInput: (value) => {
            drafts[field.path] = value;
            state.error = null;
            state.selectedSectionId = section.id;
          },
          onFocus: () => {
            state.selectedSectionId = section.id;
          },
          onAction:
            field.actionKind && options.onFieldAction
              ? () => options.onFieldAction!(section.id, field.path, field.actionKind!)
              : undefined,
        }),
      );
    });
    const actions = document.createElement("div");
    actions.className = "form-actions settings-actions";
    const save = createSectionAction(state.savingSectionId === section.id ? "Saving…" : section.saveLabel, true);
    save.disabled = state.savingSectionId === section.id || section.fields.every((field) => field.editable === false);
    save.addEventListener("click", () => options.onSaveSection(section.id));
    const diffToggle = createSectionAction(state.expandedDiffs.has(section.id) ? "Hide diff" : "Show diff");
    diffToggle.addEventListener("click", () => options.onToggleDiff(section.id));
    const pathToggle = createSectionAction(
      state.expandedPaths.has(section.id) ? "Hide underlying paths" : "View underlying path",
    );
    pathToggle.addEventListener("click", () => options.onTogglePaths(section.id));
    actions.append(pathToggle, diffToggle, save);
    card.append(header, grid, actions);
    if (state.expandedPaths.has(section.id)) {
      const paths = document.createElement("div");
      paths.className = "settings-paths";
      buildUnderlyingPaths(section).forEach((path) => {
        const chip = document.createElement("span");
        chip.className = "mc-badge";
        chip.textContent = path;
        paths.append(chip);
      });
      card.append(paths);
    }
    if (state.expandedDiffs.has(section.id)) {
      const diff = document.createElement("pre");
      diff.className = "config-code settings-diff";
      diff.textContent = buildSectionDiffPreview(section, drafts, state.effective, state.overlay);
      card.append(diff);
    }
    stack.append(card);
  });
  content.append(stack);
}
