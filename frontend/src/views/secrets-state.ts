export interface SecretsState {
  keys: string[];
  loading: boolean;
  error: string | null;
  selectedKey: string;
  draftKey: string;
  draftValue: string;
  deleteConfirm: string;
}

export function createSecretsState(): SecretsState {
  return {
    keys: [],
    loading: true,
    error: null,
    selectedKey: "",
    draftKey: "",
    draftValue: "",
    deleteConfirm: "",
  };
}
