import type { SettingsMode } from "./settings-types.js";

export interface SettingsState {
  effective: Record<string, unknown>;
  overlay: Record<string, unknown>;
  schema: Record<string, unknown> | null;
  savingSectionId: string | null;
  error: string | null;
  filter: string;
  selectedSectionId: string;
  drafts: Record<string, Record<string, string>>;
  expandedDiffs: Set<string>;
  expandedPaths: Set<string>;
  /** Expert toggle state persisted across re-renders. Keyed by `${sectionId}:${groupId}`. */
  openExperts: Set<string>;
  /** Focused = common settings; advanced = full settings. */
  mode: SettingsMode;
}

function readPersistedMode(): SettingsMode {
  const stored = localStorage.getItem("risoluto.settingsMode");
  return stored === "advanced" ? "advanced" : "simple";
}

export function createSettingsState(): SettingsState {
  return {
    effective: {},
    overlay: {},
    schema: null,
    savingSectionId: null,
    error: null,
    filter: "",
    selectedSectionId: "tracker",
    drafts: {},
    expandedDiffs: new Set<string>(),
    expandedPaths: new Set<string>(),
    openExperts: new Set<string>(),
    mode: readPersistedMode(),
  };
}
