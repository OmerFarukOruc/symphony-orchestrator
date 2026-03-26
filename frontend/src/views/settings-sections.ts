import { createEmptyState } from "../components/empty-state";
import { createIcon } from "../ui/icons";

import {
  buildSectionDiffPreview,
  buildUnderlyingPaths,
  ensureSectionDrafts,
  formatFieldDraft,
  SECTION_GROUPS,
  sectionGroups,
  sectionMatchesFilter,
  SECTION_IDS,
  type SettingsSectionDefinition,
} from "./settings-helpers";
import { createSectionAction, createSettingsField } from "./settings-forms";
import { getValueAtPath } from "./settings-paths";
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

/** AbortController for cleaning up event listeners between renders. */
let renderAbortController: AbortController | null = null;

export function renderSettingsLayout(
  rail: HTMLElement,
  content: HTMLElement,
  searchInput: HTMLInputElement,
  state: SettingsState,
  sections: SettingsSectionDefinition[],
  options: SettingsRenderOptions,
): SettingsSectionDefinition[] {
  renderAbortController?.abort();
  renderAbortController = new AbortController();
  const signal = renderAbortController.signal;

  const visibleSections = sections.filter((section) =>
    sectionMatchesFilter(section, state.filter, state.drafts[section.id]),
  );
  if (!visibleSections.some((section) => section.id === state.selectedSectionId)) {
    state.selectedSectionId = visibleSections[0]?.id ?? state.selectedSectionId;
  }
  renderRail(rail, visibleSections, state, options, signal);
  renderContent(content, searchInput, visibleSections, state, options, signal);
  return visibleSections;
}

function renderRail(
  rail: HTMLElement,
  sections: SettingsSectionDefinition[],
  state: SettingsState,
  options: SettingsRenderOptions,
  signal: AbortSignal,
): void {
  rail.replaceChildren();
  const card = document.createElement("section");
  card.className = "mc-panel settings-rail-card";
  const railLabel = document.createElement("span");
  railLabel.className = "settings-rail-label";
  railLabel.textContent = "Settings";
  card.append(railLabel);

  for (const group of Object.values(SECTION_GROUPS)) {
    const groupSections = sections.filter((section) => section.groupId === group.id);
    if (groupSections.length === 0) continue;

    const header = document.createElement("div");
    header.className = "settings-nav-group-header";
    header.append(createIcon(group.icon, { size: 14 }));
    const headerLabel = document.createElement("span");
    headerLabel.textContent = group.label;
    header.append(headerLabel);
    card.append(header);

    for (const section of groupSections) {
      card.append(createNavItem(section, state, options, signal));
    }
  }

  rail.append(card);
}

function createNavItem(
  section: SettingsSectionDefinition,
  state: SettingsState,
  options: SettingsRenderOptions,
  signal: AbortSignal,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-nav-item";
  button.classList.toggle("is-selected", section.id === state.selectedSectionId);

  const topRow = document.createElement("span");
  topRow.className = "settings-nav-top";

  const title = document.createElement("span");
  title.className = "settings-nav-title";
  title.textContent = section.title;

  topRow.append(title);

  if (section.startHere) {
    const badge = document.createElement("span");
    badge.className = "settings-start-here";
    badge.textContent = "Start here";
    topRow.append(badge);
  }

  const hasOverrides = section.prefixes.some((prefix) => getValueAtPath(state.overlay, prefix) !== undefined);
  if (hasOverrides) {
    const modifiedBadge = document.createElement("span");
    modifiedBadge.className = "settings-nav-badge-modified";
    modifiedBadge.setAttribute("aria-label", "Has saved overrides");
    topRow.append(modifiedBadge);
  }

  const sectionDrafts = state.drafts[section.id];
  if (sectionDrafts) {
    const hasUnsaved = Object.entries(sectionDrafts).some(([path, draftValue]) => {
      const effectiveValue = getValueAtPath(state.effective, path);
      const formatted = formatFieldDraft(
        section.fields.find((field) => field.path === path) ?? { path, label: "", kind: "text" },
        effectiveValue,
      );
      return draftValue !== formatted;
    });
    if (hasUnsaved) {
      const unsavedBadge = document.createElement("span");
      unsavedBadge.className = "settings-nav-badge-unsaved";
      unsavedBadge.setAttribute("aria-label", "Has unsaved changes");
      topRow.append(unsavedBadge);
    }
  }

  const desc = document.createElement("span");
  desc.className = "settings-nav-desc";
  desc.textContent =
    section.description.length > 44 ? `${section.description.slice(0, 44)}\u2026` : section.description;

  button.append(topRow, desc);
  button.addEventListener(
    "click",
    () => {
      options.onSelectSection(section.id);
      document.getElementById(`settings-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    { signal },
  );
  return button;
}

function renderContent(
  content: HTMLElement,
  searchInput: HTMLInputElement,
  sections: SettingsSectionDefinition[],
  state: SettingsState,
  options: SettingsRenderOptions,
  signal: AbortSignal,
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
  content.append(createSettingsIntro());
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

  const selectedSection = sections.find((section) => section.id === state.selectedSectionId) ?? sections[0];
  if (!selectedSection) {
    return;
  }

  content.append(buildSectionCard(selectedSection, state, options, signal));
}

function buildSectionCard(
  section: SettingsSectionDefinition,
  state: SettingsState,
  options: SettingsRenderOptions,
  signal: AbortSignal,
): HTMLElement {
  const stack = document.createElement("div");
  stack.className = "settings-stack";

  const drafts = ensureSectionDrafts(state.drafts, section, state.effective);
  const card = document.createElement("section");
  card.className = "mc-panel settings-card";
  card.id = `settings-${section.id}`;

  card.append(buildSectionHeader(section));

  const groups = sectionGroups(section);
  groups.forEach((group, index) => {
    card.append(createGroupElement(section, group, drafts, state, options, index === 0));
  });

  card.append(buildSectionActions(section, state, options, signal));
  card.append(buildDevTools(section, drafts, state, options, signal));

  stack.append(card);
  return stack;
}

function buildSectionHeader(section: SettingsSectionDefinition): HTMLElement {
  const header = document.createElement("div");
  header.className = "settings-section-header";

  const titleRow = document.createElement("div");
  titleRow.className = "settings-section-title-row";

  const title = document.createElement("h2");
  title.className = "settings-section-title";
  title.textContent = section.title;

  const badge = document.createElement("span");
  badge.className = "settings-section-badge";
  badge.textContent = section.badge;

  titleRow.append(title, badge);

  const desc = document.createElement("p");
  desc.className = "settings-section-desc";
  desc.textContent = section.description;

  const nextStep = createNextStepHint(section.id);

  header.append(titleRow, desc);
  if (nextStep) {
    header.append(nextStep);
  }
  return header;
}

function buildSectionActions(
  section: SettingsSectionDefinition,
  state: SettingsState,
  options: SettingsRenderOptions,
  signal: AbortSignal,
): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "form-actions settings-actions";

  const save = createSectionAction(state.savingSectionId === section.id ? "Saving\u2026" : section.saveLabel, true);
  save.disabled = state.savingSectionId === section.id || section.fields.every((field) => field.editable === false);
  save.addEventListener("click", () => options.onSaveSection(section.id), { signal });
  actions.append(save);
  return actions;
}

function buildDevTools(
  section: SettingsSectionDefinition,
  drafts: Record<string, string>,
  state: SettingsState,
  options: SettingsRenderOptions,
  signal: AbortSignal,
): HTMLElement {
  const devTools = document.createElement("details");
  devTools.className = "settings-dev-tools";
  devTools.open = state.expandedDiffs.has(section.id) || state.expandedPaths.has(section.id);

  const devSummary = document.createElement("summary");
  devSummary.textContent = "Developer tools";
  devTools.append(devSummary);

  const devBody = document.createElement("div");
  devBody.className = "settings-dev-body";

  const devActions = document.createElement("div");
  devActions.className = "settings-dev-actions";

  const pathToggle = createSectionAction(state.expandedPaths.has(section.id) ? "Hide paths" : "View config paths");
  pathToggle.addEventListener("click", () => options.onTogglePaths(section.id), { signal });

  const diffToggle = createSectionAction(state.expandedDiffs.has(section.id) ? "Hide diff" : "Show diff");
  diffToggle.addEventListener("click", () => options.onToggleDiff(section.id), { signal });

  devActions.append(pathToggle, diffToggle);
  devBody.append(devActions);

  if (state.expandedPaths.has(section.id)) {
    const paths = document.createElement("div");
    paths.className = "settings-paths";
    buildUnderlyingPaths(section).forEach((path) => {
      const chip = document.createElement("span");
      chip.className = "mc-badge";
      chip.textContent = path;
      paths.append(chip);
    });
    devBody.append(paths);
  }

  if (state.expandedDiffs.has(section.id)) {
    const diff = document.createElement("pre");
    diff.className = "config-code settings-diff";
    diff.textContent = buildSectionDiffPreview(section, drafts, state.effective, state.overlay);
    devBody.append(diff);
  }

  devTools.append(devBody);
  return devTools;
}

function createGroupElement(
  section: SettingsSectionDefinition,
  group: ReturnType<typeof sectionGroups>[number],
  drafts: Record<string, string>,
  state: SettingsState,
  options: SettingsRenderOptions,
  first: boolean,
): HTMLElement {
  if (group.advanced) {
    const details = document.createElement("details");
    details.className = "settings-group-collapsed";

    const summary = document.createElement("summary");
    summary.textContent = group.title;
    summary.setAttribute("aria-label", group.title);
    if (group.description) {
      summary.dataset.description = group.description;
    }
    details.append(summary, createGroupGrid(section, group, drafts, state, options));
    return details;
  }

  const wrapper = document.createElement("section");
  wrapper.className = "settings-group";

  if (group.title !== "Settings") {
    const heading = document.createElement("div");
    heading.className = "settings-group-heading";
    if (first) {
      heading.classList.add("is-first");
    }

    const title = document.createElement("h3");
    title.textContent = group.title;
    heading.append(title);

    if (group.description) {
      const desc = document.createElement("p");
      desc.className = "settings-group-desc";
      desc.textContent = group.description;
      heading.append(desc);
    }
    wrapper.append(heading);
  }

  wrapper.append(createGroupGrid(section, group, drafts, state, options));
  return wrapper;
}

function createGroupGrid(
  section: SettingsSectionDefinition,
  group: ReturnType<typeof sectionGroups>[number],
  drafts: Record<string, string>,
  state: SettingsState,
  options: SettingsRenderOptions,
): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "form-grid settings-grid";

  group.fields.forEach((field, fieldIndex) => {
    const actionKind = field.actionKind;
    const hintId = `settings-hint-${section.id}-${fieldIndex}`;
    grid.append(
      createSettingsField(field, {
        value: drafts[field.path] ?? "",
        hintId,
        onInput: (value) => {
          drafts[field.path] = value;
          state.error = null;
          state.selectedSectionId = section.id;
        },
        onFocus: () => {
          state.selectedSectionId = section.id;
        },
        onAction:
          actionKind && options.onFieldAction
            ? () => options.onFieldAction?.(section.id, field.path, actionKind)
            : undefined,
      }),
    );
  });

  return grid;
}

function createSettingsIntro(): HTMLElement {
  const intro = document.createElement("section");
  intro.className = "settings-intro";

  const title = document.createElement("p");
  title.className = "settings-intro-title";
  title.textContent = "Start with Tracker, then confirm provider access and sandbox defaults.";

  const body = document.createElement("p");
  body.className = "settings-intro-body";
  body.textContent =
    "Most setups only need a tracker, a project, and the states that mean work is active or done. Everything else can wait.";

  intro.append(title, body);
  return intro;
}

function createNextStepHint(sectionId: string): HTMLElement | null {
  const text =
    sectionId === SECTION_IDS.TRACKER
      ? "Next: set your model provider so Symphony can authenticate and run Codex."
      : sectionId === SECTION_IDS.MODEL_PROVIDER_AUTH
        ? "Next: review sandbox defaults so agent runs match your local safety posture."
        : sectionId === SECTION_IDS.SANDBOX
          ? "Next: create or move an issue into an active state so Symphony can start working."
          : null;

  if (!text) {
    return null;
  }

  const hint = document.createElement("p");
  hint.className = "settings-next-step";
  hint.textContent = text;
  return hint;
}
