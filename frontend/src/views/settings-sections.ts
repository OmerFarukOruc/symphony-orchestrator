import { createEmptyState } from "../components/empty-state";

import {
  buildSectionDiffPreview,
  buildUnderlyingPaths,
  ensureSectionDrafts,
  sectionGroups,
  sectionMatchesFilter,
  SECTION_IDS,
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
  if (!visibleSections.some((section) => section.id === state.selectedSectionId)) {
    state.selectedSectionId = visibleSections[0]?.id ?? state.selectedSectionId;
  }
  renderRail(rail, visibleSections, state, options);
  renderContent(content, searchInput, visibleSections, state, options);
  return visibleSections;
}

/** Section IDs that are grouped under "Advanced" in the rail navigation. */
const ADVANCED_SECTION_IDS: ReadonlySet<string> = new Set([SECTION_IDS.WORKFLOW_STAGES, SECTION_IDS.FEATURE_FLAGS, SECTION_IDS.RUNTIME_PATHS]);

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
  railH2.textContent = "Settings";
  card.append(railH2);

  const basicSections = sections.filter((section) => !ADVANCED_SECTION_IDS.has(section.id));
  const advancedSections = sections.filter((section) => ADVANCED_SECTION_IDS.has(section.id));

  basicSections.forEach((section) => {
    card.append(createNavItem(section, state, options));
  });

  if (basicSections.length > 0 && advancedSections.length > 0) {
    const separator = document.createElement("div");
    separator.className = "settings-nav-separator";
    const advancedLabel = document.createElement("div");
    advancedLabel.className = "settings-nav-group-label";
    advancedLabel.textContent = "Advanced";
    card.append(separator, advancedLabel);
  }

  advancedSections.forEach((section) => {
    card.append(createNavItem(section, state, options));
  });

  rail.append(card);
}

function createNavItem(
  section: SettingsSectionDefinition,
  state: SettingsState,
  options: SettingsRenderOptions,
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

  const desc = document.createElement("span");
  desc.className = "settings-nav-desc";
  desc.textContent = section.description.length > 44 ? `${section.description.slice(0, 44)}…` : section.description;

  button.append(topRow, desc);
  button.addEventListener("click", () => options.onSelectSection(section.id));
  return button;
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

  const stack = document.createElement("div");
  stack.className = "settings-stack";

  const section = selectedSection;
  const drafts = ensureSectionDrafts(state.drafts, section, state.effective);
  const card = document.createElement("section");
  card.className = "mc-panel settings-card";
  card.id = `settings-${section.id}`;

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

  const groups = sectionGroups(section);

  const actions = document.createElement("div");
  actions.className = "form-actions settings-actions";

  const save = createSectionAction(state.savingSectionId === section.id ? "Saving…" : section.saveLabel, true);
  save.disabled = state.savingSectionId === section.id || section.fields.every((field) => field.editable === false);
  save.addEventListener("click", () => options.onSaveSection(section.id));
  actions.append(save);

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
  pathToggle.addEventListener("click", () => options.onTogglePaths(section.id));

  const diffToggle = createSectionAction(state.expandedDiffs.has(section.id) ? "Hide diff" : "Show diff");
  diffToggle.addEventListener("click", () => options.onToggleDiff(section.id));

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
  card.append(header);
  groups.forEach((group, index) => {
    card.append(createGroupElement(section, group, drafts, state, options, index === 0));
  });
  card.append(actions, devTools);
  stack.append(card);
  content.append(stack);
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

  group.fields.forEach((field) => {
    const actionKind = field.actionKind;
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
