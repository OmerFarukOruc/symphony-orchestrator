// Public API barrel for the settings feature slice.
// Consumers should import from this file rather than individual modules.

export { createSettingsPage } from "./settings-view.js";
export { createSettingsWorkbench, type SettingsWorkbench } from "./settings-workbench.js";
export { createSettingsState, type SettingsState } from "./settings-state.js";
export {
  buildSettingsSections,
  formatFieldDraft,
  getSectionById,
  isSchemaLimited,
  sectionMatchesFilter,
  sectionVisibleInMode,
  sectionHasUnsavedDrafts,
  sectionGroups,
  ensureSectionDrafts,
  buildSectionDiffPreview,
  buildUnderlyingPaths,
  getSectionGroup,
  SECTION_IDS,
  SECTION_GROUPS,
  type SettingsFieldDefinition,
  type SettingsFieldGroup,
  type SettingsFieldOption,
  type SettingsFieldTier,
  type SettingsMode,
  type SettingsSectionDefinition,
} from "./settings-helpers.js";
export {
  buildSectionPatchPlan,
  type SectionPatchPlan,
  type SectionPatchEntry,
  type SettingsDraftIssue,
} from "./settings-patches.js";
export { getValueAtPath, setValueAtPath } from "./settings-paths.js";
export {
  isSettingsPageData,
  renderLoadedSettings,
  updateSettingsHeader,
  type SettingsPageData,
} from "./settings-view-render.js";
export { renderSettingsLayout } from "./settings-sections.js";
export { createSettingsField, createSectionAction } from "./settings-forms.js";
export { createSettingsKeyboardHandler } from "./settings-keyboard.js";
export { buildDefaultSections } from "./settings-section-defs.js";
