import { describe, expect, it } from "vitest";

import { createTemplatesState } from "../../frontend/src/views/templates-state";

describe("TemplatesState", () => {
  it("creates default state with empty values", () => {
    const state = createTemplatesState();
    expect(state.templates).toEqual([]);
    expect(state.selectedId).toBeNull();
    expect(state.editorName).toBe("");
    expect(state.editorBody).toBe("");
    expect(state.dirty).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("tracks selection state", () => {
    const state = createTemplatesState();
    state.selectedId = "tmpl-1";
    state.editorName = "My Template";
    state.editorBody = "Hello {{ name }}";
    expect(state.selectedId).toBe("tmpl-1");
    expect(state.editorName).toBe("My Template");
  });

  it("tracks dirty flag", () => {
    const state = createTemplatesState();
    expect(state.dirty).toBe(false);
    state.dirty = true;
    expect(state.dirty).toBe(true);
  });

  it("tracks preview state", () => {
    const state = createTemplatesState();
    state.showPreview = true;
    state.previewOutput = "Rendered output";
    expect(state.showPreview).toBe(true);
    expect(state.previewOutput).toBe("Rendered output");
    expect(state.previewError).toBeNull();
  });

  it("tracks preview error", () => {
    const state = createTemplatesState();
    state.previewError = "Liquid syntax error";
    expect(state.previewError).toBe("Liquid syntax error");
  });

  it("tracks active template ID", () => {
    const state = createTemplatesState();
    state.activeTemplateId = "default";
    expect(state.activeTemplateId).toBe("default");
  });

  it("tracks async operation flags independently", () => {
    const state = createTemplatesState();
    state.saving = true;
    expect(state.creating).toBe(false);
    expect(state.deleting).toBe(false);
    state.saving = false;
    state.deleting = true;
    expect(state.saving).toBe(false);
    expect(state.deleting).toBe(true);
  });
});
