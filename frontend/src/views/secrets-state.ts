export interface SecretsState {
  keys: string[];
  loading: boolean;
  saving: boolean;
  deleting: boolean;
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
    saving: false,
    deleting: false,
    error: null,
    selectedKey: "",
    draftKey: "",
    draftValue: "",
    deleteConfirm: "",
  };
}
