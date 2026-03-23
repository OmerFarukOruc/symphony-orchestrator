export type ConfigMode = "tree" | "path" | "raw";

export interface ConfigState {
  mode: ConfigMode;
  filter: string;
  effective: Record<string, unknown>;
  overlay: Record<string, unknown>;
  schema: Record<string, unknown> | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  selectedPath: string;
  pathValue: string;
  rawPatch: string;
  showSchema: boolean;
}

export function createConfigState(): ConfigState {
  return {
    mode: "tree",
    filter: "",
    effective: {},
    overlay: {},
    schema: null,
    loading: true,
    saving: false,
    error: null,
    selectedPath: "",
    pathValue: "",
    rawPatch: "{}",
    showSchema: false,
  };
}
