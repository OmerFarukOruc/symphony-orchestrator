export interface SettingsState {
  effective: Record<string, unknown>;
  overlay: Record<string, unknown>;
  schema: Record<string, unknown> | null;
  loading: boolean;
  savingSectionId: string | null;
  error: string | null;
  filter: string;
  selectedSectionId: string;
  drafts: Record<string, Record<string, string>>;
  expandedDiffs: Set<string>;
  expandedPaths: Set<string>;
}

export function createSettingsState(): SettingsState {
  return {
    effective: {},
    overlay: {},
    schema: null,
    loading: true,
    savingSectionId: null,
    error: null,
    filter: "",
    selectedSectionId: "tracker",
    drafts: {},
    expandedDiffs: new Set<string>(),
    expandedPaths: new Set<string>(),
  };
}
