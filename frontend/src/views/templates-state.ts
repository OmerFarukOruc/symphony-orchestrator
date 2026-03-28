import type { PromptTemplate } from "../types";

export type { PromptTemplate };

export interface TemplatesState {
  templates: PromptTemplate[];
  selectedId: string | null;
  editorName: string;
  editorBody: string;
  dirty: boolean;
  previewOutput: string;
  previewError: string | null;
  showPreview: boolean;
  activeTemplateId: string | null;
  creating: boolean;
  saving: boolean;
  deleting: boolean;
  loading: boolean;
  error: string | null;
}

export function createTemplatesState(): TemplatesState {
  return {
    templates: [],
    selectedId: null,
    editorName: "",
    editorBody: "",
    dirty: false,
    previewOutput: "",
    previewError: null,
    showPreview: false,
    activeTemplateId: null,
    creating: false,
    saving: false,
    deleting: false,
    loading: false,
    error: null,
  };
}
