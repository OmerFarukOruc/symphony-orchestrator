import { createEmptyState } from "../../components/empty-state";
import { createIcon } from "../../ui/icons";

import {
  buildSectionDiffPreview,
  buildUnderlyingPaths,
  ensureSectionDrafts,
  formatFieldDraft,
  SECTION_GROUPS,
  sectionGroups,
  sectionMatchesFilter,
  sectionVisibleInMode,
  SECTION_IDS,
  type SettingsSectionDefinition,
} from "./settings-helpers";
import { createSectionAction, createSettingsField } from "./settings-forms";
import { getValueAtPath } from "./settings-paths";
import type { SettingsState } from "./settings-state";
import type { SettingsMode } from "./settings-types";

interface SettingsRenderOptions {
  onFilter: (value: string) => void;
  onSelectSection: (sectionId: string) => void;
  onToggleDiff: (sectionId: string) => void;
  onTogglePaths: (sectionId: string) => void;
  onSaveSection: (sectionId: string) => void;
  /** Called when the user switches between Focused and Advanced modes. */
  onSetMode?: (mode: SettingsMode) => void;
  /** Called when a field-level action button is clicked (e.g. "Browse" for project slug). */
  onFieldAction?: (sectionId: string, fieldPath: string, actionKind: string) => void;
}

/** AbortController for cleaning up event listeners between renders. */
let renderAbortController: AbortController | null = null;

/**
 * When a rail click triggers `scrollIntoView({ behavior: "smooth" })`, the
 * scroll spy would fire on every frame and flash through intermediate sections.
 * While `true`, scroll events are ignored. Cleared via debounce after scroll settles.
 */
let scrollSpySuppressed = false;
let scrollSettleTimer = 0;

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

  // Sort sections by sidebar group order so content and rail stay aligned.
  const groupOrder = Object.values(SECTION_GROUPS).map((g) => g.id);
  const visibleSections = sections
    .filter(
      (section) =>
        sectionVisibleInMode(section, state.mode) &&
        sectionMatchesFilter(section, state.filter, state.drafts[section.id]),
    )
    .sort((a, b) => {
      const aGroup = groupOrder.indexOf((a.groupId ?? "") as (typeof groupOrder)[number]);
      const bGroup = groupOrder.indexOf((b.groupId ?? "") as (typeof groupOrder)[number]);
      return aGroup - bGroup;
    });
  if (!visibleSections.some((section) => section.id === state.selectedSectionId)) {
    state.selectedSectionId = visibleSections[0]?.id ?? state.selectedSectionId;
  }
  renderRail(rail, visibleSections, state, options, signal);
  renderContent(content, searchInput, visibleSections, state, options, signal);

  // Scroll spy: sync rail highlight with content scroll position.
  // Deferred to next frame because `content` may not be in the DOM yet
  // (renderAsyncState calls renderContent to build nodes, then appends them).
  requestAnimationFrame(() => {
    if (signal.aborted) return;
    const scrollRoot = content.closest<HTMLElement>(".shell-outlet");
    if (!scrollRoot) return;

    let rafId = 0;
    const updateActiveSection = () => {
      const rootTop = scrollRoot.getBoundingClientRect().top;
      const anchor = rootTop + scrollRoot.clientHeight * 0.2;
      let activeId = visibleSections[0]?.id;

      // At bottom of scroll — always select last section
      const atBottom = scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight < 2;
      if (atBottom && visibleSections.length > 0) {
        activeId = visibleSections.at(-1)!.id;
      } else {
        for (const section of visibleSections) {
          const el = document.getElementById(`settings-${section.id}`);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= anchor) {
            activeId = section.id;
          }
        }
      }

      if (activeId && activeId !== state.selectedSectionId) {
        state.selectedSectionId = activeId;
        highlightRailItem(rail, activeId);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      if (scrollSpySuppressed) {
        // While suppressed, keep resetting the settle timer.
        // Once scroll events stop for 150ms, re-enable spy and do final sync.
        clearTimeout(scrollSettleTimer);
        scrollSettleTimer = window.setTimeout(() => {
          scrollSpySuppressed = false;
          updateActiveSection();
        }, 150);
        return;
      }
      rafId = requestAnimationFrame(updateActiveSection);
    };

    scrollRoot.addEventListener("scroll", onScroll, { signal, passive: true });
    signal.addEventListener("abort", () => cancelAnimationFrame(rafId));
    // Initial sync
    requestAnimationFrame(updateActiveSection);
  });

  return visibleSections;
}

/** Toggle `.is-selected` on rail buttons to match the active section. */
function highlightRailItem(rail: HTMLElement, sectionId: string): void {
  for (const btn of rail.querySelectorAll<HTMLElement>(".settings-nav-item")) {
    const active = btn.dataset.sectionId === sectionId;
    btn.classList.toggle("is-selected", active);
    if (active) {
      // Scroll within the rail only — avoid scrollIntoView which scrolls
      // all ancestors and fights with the content scroll spy.
      const railRect = rail.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      if (btnRect.top < railRect.top || btnRect.bottom > railRect.bottom) {
        rail.scrollTop += btnRect.top - railRect.top - railRect.height / 2 + btnRect.height / 2;
      }
    }
  }
}

function renderRail(
  rail: HTMLElement,
  sections: SettingsSectionDefinition[],
  state: SettingsState,
  options: SettingsRenderOptions,
  signal: AbortSignal,
): void {
  rail.replaceChildren();

  // ── Mode toggle: Focused / Advanced ───────────────────
  rail.append(createModeToggle(state, options, signal));

  for (const group of Object.values(SECTION_GROUPS)) {
    const groupSections = sections.filter((section) => section.groupId === group.id);
    if (groupSections.length === 0) continue;

    const header = document.createElement("div");
    header.className = "settings-nav-group-header";
    header.append(
      createIcon(group.icon, { size: 14, className: "settings-nav-group-icon" }),
      document.createTextNode(group.label),
    );
    rail.append(header);

    for (const section of groupSections) {
      rail.append(createNavItem(section, state, options, signal));
    }
  }
}

function createModeToggle(state: SettingsState, options: SettingsRenderOptions, signal: AbortSignal): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "settings-mode-toggle";

  const simpleBtn = document.createElement("button");
  simpleBtn.type = "button";
  simpleBtn.className = "settings-mode-btn";
  simpleBtn.classList.toggle("is-active", state.mode === "simple");
  simpleBtn.textContent = "Focused";
  simpleBtn.title = "Show the common settings";

  const advancedBtn = document.createElement("button");
  advancedBtn.type = "button";
  advancedBtn.className = "settings-mode-btn";
  advancedBtn.classList.toggle("is-active", state.mode === "advanced");
  advancedBtn.textContent = "Advanced";
  advancedBtn.title = "Show all settings and expert options";

  simpleBtn.addEventListener("click", () => options.onSetMode?.("simple"), { signal });
  advancedBtn.addEventListener("click", () => options.onSetMode?.("advanced"), { signal });

  wrapper.append(simpleBtn, advancedBtn);
  return wrapper;
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
      const field = section.fields.find((f) => f.path === path);
      if (!field) return false;
      const effectiveValue = getValueAtPath(state.effective, path);
      return draftValue !== formatFieldDraft(field, effectiveValue);
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
  button.dataset.sectionId = section.id;
  button.addEventListener(
    "click",
    () => {
      state.selectedSectionId = section.id;
      highlightRailItem(button.closest(".settings-rail") ?? button.parentElement!, section.id);
      // Suppress scroll spy until the smooth-scroll settles so intermediate
      // sections don't flash in the rail.
      scrollSpySuppressed = true;
      clearTimeout(scrollSettleTimer);
      const target = document.getElementById(`settings-${section.id}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  hint.textContent =
    "Search sections, fields, and values. Press / to focus search. Cmd/Ctrl+Enter saves the current section.";
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
        "No matching settings",
        "Nothing matches that search. Try a broader term like provider, sandbox, or tracker.",
        "Clear search",
        () => options.onFilter(""),
      ),
    );
    return;
  }

  for (const section of sections) {
    content.append(buildSectionCard(section, state, options, signal));
  }
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

  const allGroups = sectionGroups(section);
  // In Focused mode, hide expert-tier groups entirely
  const groups = state.mode === "simple" ? allGroups.filter((g) => g.tier !== "expert") : allGroups;
  let prevTier: string | undefined;
  groups.forEach((group, index) => {
    card.append(createGroupElement(section, group, drafts, state, options, index === 0, prevTier));
    prevTier = group.tier ?? (group.advanced ? "expert" : "essential");
  });

  card.append(buildSectionActions(section, state, options, signal));

  // Developer tools: only in Advanced mode
  if (state.mode === "advanced") {
    card.append(buildDevTools(section, drafts, state, options, signal));
  }

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
  prevTier?: string,
): HTMLElement {
  const tier = group.tier ?? (group.advanced ? "expert" : "essential");

  // Expert tier → collapsible <details> with persisted open state
  if (tier === "expert") {
    const details = document.createElement("details");
    details.className = "settings-group-collapsed";
    const key = `${section.id}:${group.id}`;
    details.open = state.openExperts.has(key);
    details.addEventListener("toggle", () => {
      if (details.open) state.openExperts.add(key);
      else state.openExperts.delete(key);
    });

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

  // Standard tier → add a dashed separator if previous group was essential
  if (tier === "standard" && prevTier === "essential") {
    const sep = document.createElement("hr");
    sep.className = "settings-tier-separator";
    wrapper.append(sep);
  }

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
  title.textContent = "Start with Tracker, then provider and sandbox defaults.";

  const body = document.createElement("p");
  body.className = "settings-intro-body";
  body.textContent =
    "Most setups only need a tracker, a project, and the states that mean work is active or done. Switch to Advanced when you need the rest.";

  intro.append(title, body);
  return intro;
}

function createNextStepHint(sectionId: string): HTMLElement | null {
  const text =
    sectionId === SECTION_IDS.TRACKER
      ? "Next: choose a model provider and sign-in method."
      : sectionId === SECTION_IDS.MODEL_PROVIDER_AUTH
        ? "Next: review sandbox defaults so runs use the safety level you expect."
        : sectionId === SECTION_IDS.SANDBOX
          ? "Next: move an issue into an active state so Risoluto can pick it up."
          : null;

  if (!text) {
    return null;
  }

  const hint = document.createElement("p");
  hint.className = "settings-next-step";
  hint.textContent = text;
  return hint;
}
