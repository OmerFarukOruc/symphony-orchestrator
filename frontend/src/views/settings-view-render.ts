import type { AsyncState } from "../utils/async-state.js";

import { router } from "../router.js";
import { buildSettingsSections, isSchemaLimited } from "./settings-helpers.js";
import { renderSettingsLayout } from "./settings-sections.js";
import type { SettingsState } from "./settings-state.js";
import type { SettingsMode } from "./settings-types.js";

export interface SettingsPageData {
  effective: Record<string, unknown>;
  overlay: Record<string, unknown>;
  schema: Record<string, unknown> | null;
}

interface RenderLoadedSettingsOptions {
  onFilter: (value: string) => void;
  onSelectSection: (sectionId: string) => void;
  onToggleDiff: (sectionId: string) => void;
  onTogglePaths: (sectionId: string) => void;
  onSaveSection: (sectionId: string) => void;
  onSetMode?: (mode: SettingsMode) => void;
  onBrowseLinearProjects: (fieldPath: string) => void;
}

export function isSettingsPageData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function updateSettingsHeader(
  subtitle: HTMLElement,
  schemaBadge: HTMLElement,
  state: SettingsState,
  loadState: AsyncState<SettingsPageData>,
): void {
  if (loadState.loading) {
    subtitle.textContent = "Loading your tracker, provider, and runtime settings.";
    schemaBadge.textContent = "Loading";
    return;
  }
  if (loadState.error) {
    subtitle.textContent = "Settings could not be loaded. Retry after fixing the API or network issue.";
    schemaBadge.textContent = "Unavailable";
    return;
  }
  if (!loadState.data) {
    subtitle.textContent = "Settings are not available yet.";
    schemaBadge.textContent = "Empty";
    return;
  }
  syncLoadedData(state, loadState.data);
  subtitle.textContent = isSchemaLimited(state.schema)
    ? "Configure your tracker, provider, and sandbox so Risoluto can start processing issues."
    : "Select a section to review how Risoluto connects, authenticates, and runs work.";
  schemaBadge.textContent = isSchemaLimited(state.schema) ? "Schema limited" : "Schema guided";
}

export function renderLoadedSettings(
  rail: HTMLElement,
  content: HTMLElement,
  searchInput: HTMLInputElement,
  state: SettingsState,
  data: SettingsPageData,
  options: RenderLoadedSettingsOptions,
): HTMLElement[] {
  syncLoadedData(state, data);
  const sections = buildSettingsSections(state.schema, state.effective);
  if (!sections.some((section) => section.id === state.selectedSectionId)) {
    state.selectedSectionId = sections[0]?.id ?? "tracker";
  }
  renderSettingsLayout(rail, content, searchInput, state, sections, {
    onFilter: options.onFilter,
    onSelectSection: options.onSelectSection,
    onToggleDiff: options.onToggleDiff,
    onTogglePaths: options.onTogglePaths,
    onSaveSection: options.onSaveSection,
    onSetMode: options.onSetMode,
    onFieldAction: (_sectionId, fieldPath, actionKind) => {
      if (actionKind === "browse-linear-projects") {
        options.onBrowseLinearProjects(fieldPath);
      }
      if (actionKind === "navigate-templates") {
        router.navigate("/templates");
      }
    },
  });
  return [rail, content];
}

function syncLoadedData(state: SettingsState, data: SettingsPageData): void {
  state.effective = data.effective;
  state.overlay = data.overlay;
  state.schema = data.schema;
}
