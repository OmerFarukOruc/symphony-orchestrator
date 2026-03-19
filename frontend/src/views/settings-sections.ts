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
  card.innerHTML = `<h2>Sections</h2><p class="text-secondary">Grouped for operators first, advanced knobs after that.</p>`;
  sections.forEach((section) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-rail-item";
    button.classList.toggle("is-selected", section.id === state.selectedSectionId);
    button.innerHTML = `<strong>${section.title}</strong><span class="mc-badge">${section.badge}</span>`;
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
      createEmptyState("No settings match that search", "Try a broader keyword such as model, sandbox, or tracker."),
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
    header.innerHTML = `<div><h2>${section.title}</h2><p class="text-secondary">${section.description}</p></div>`;
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
            state.selectedSectionId = section.id;
          },
          onFocus: () => {
            state.selectedSectionId = section.id;
          },
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
