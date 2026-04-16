import type { AsyncState } from "../../utils/async-state.js";

import { api } from "../../api.js";
import { router } from "../../router.js";
import { toast } from "../../ui/toast.js";
import { buildSettingsSections, isSchemaLimited, sectionHasUnsavedDrafts } from "./settings-helpers.js";
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
  onRevertSection: (sectionId: string) => void;
  onSetMode?: (mode: SettingsMode) => void;
  onDraftChange: (sectionId: string, fieldPath: string, value: string) => void;
  onFocusSection: (sectionId: string) => void;
  onBrowseLinearProjects: (fieldPath: string) => void;
}

export function isSettingsPageData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function updateSettingsHeader(
  subtitle: HTMLElement,
  schemaBadge: HTMLElement,
  _state: SettingsState,
  loadState: AsyncState<SettingsPageData>,
): void {
  if (loadState.loading) {
    subtitle.textContent = "Loading tracker, provider, sandbox, and runtime settings.";
    schemaBadge.textContent = "Loading…";
    return;
  }
  if (loadState.error) {
    subtitle.textContent = "Settings could not be loaded. Check the API or network, then try again.";
    schemaBadge.textContent = "Unavailable";
    return;
  }
  if (!loadState.data) {
    subtitle.textContent = "Settings are not available yet.";
    schemaBadge.textContent = "No data";
    return;
  }
  const schemaLimited = isSchemaLimited(loadState.data.schema);
  subtitle.textContent = schemaLimited
    ? "Risoluto is using guided defaults. Start with Tracker, then choose a provider and confirm sandbox settings."
    : "Risoluto loaded the full schema. Start with Tracker, then review provider, sandbox, and advanced settings.";
  schemaBadge.textContent = schemaLimited ? "Guided schema" : "Full schema";
}

export function renderLoadedSettings(
  rail: HTMLElement,
  content: HTMLElement,
  searchInput: HTMLInputElement,
  state: SettingsState,
  _data: SettingsPageData,
  options: RenderLoadedSettingsOptions,
): HTMLElement[] {
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
    onRevertSection: options.onRevertSection,
    onSetMode: options.onSetMode,
    onDraftChange: options.onDraftChange,
    onFocusSection: options.onFocusSection,
    onFieldAction: (sectionId, fieldPath, actionKind) => {
      if (actionKind === "browse-linear-projects") {
        options.onBrowseLinearProjects(fieldPath);
        return;
      }
      if (actionKind === "navigate-templates") {
        router.navigate("/templates");
        return;
      }
      if (actionKind === "send-test-slack") {
        void sendTestSlack(state, sectionId);
      }
    },
  });
  return [rail, content];
}

/**
 * Dispatch a test Slack notification. Blocks with a toast if the user has
 * unsaved drafts on the notifications section — the server reads from the
 * saved config, so testing a dirty draft would exercise the old URL.
 */
async function sendTestSlack(state: SettingsState, sectionId: string): Promise<void> {
  if (isSectionDirty(state, sectionId)) {
    toast("Unsaved changes — save first, then click Send test.", "warning");
    return;
  }
  try {
    await api.postNotificationTest();
    toast("Slack test sent — check your channel.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Slack test failed.";
    toast(message, "error");
  }
}

/**
 * A section is dirty when any field's draft value differs from the formatted
 * effective value. Mirrors the nav-badge check in `createNavItem` so the Send
 * test button uses the same truth as the UI badge.
 */
function isSectionDirty(state: SettingsState, sectionId: string): boolean {
  const sections = buildSettingsSections(state.schema, state.effective);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return false;
  return sectionHasUnsavedDrafts(section, state.drafts[sectionId], state.effective);
}
