import { describe, expect, it, vi } from "vitest";

import { createAsyncState, handleError, withLoading } from "../../frontend/src/utils/async-state";
import { renderAsyncState } from "../../frontend/src/utils/render-guards";

class FakeElement {
  readonly children: string[] = [];

  replaceChildren(...nodes: string[]): void {
    this.children.length = 0;
    this.children.push(...nodes);
  }
}

describe("async-state utilities", () => {
  it("creates a loading async state by default", () => {
    expect(createAsyncState<string[]>()).toEqual({
      loading: true,
      error: null,
      data: null,
    });
  });

  it("toggles loading and emits change notifications around async work", async () => {
    const state = createAsyncState<string[]>();
    const onChange = vi.fn();

    const result = await withLoading(
      state,
      async () => {
        expect(state.loading).toBe(true);
        return ["loaded"];
      },
      { onChange },
    );

    expect(result).toEqual(["loaded"]);
    expect(state.loading).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("normalizes unknown errors to a fallback message", () => {
    const state = createAsyncState<string[]>();

    expect(handleError(state, { code: "boom" }, "Failed to load settings.")).toBe("Failed to load settings.");
    expect(state.error).toBe("Failed to load settings.");
  });
});

describe("renderAsyncState", () => {
  it("renders loading, error, empty, and content states", () => {
    const container = new FakeElement();
    const state = createAsyncState<string[]>();

    renderAsyncState(container, state, {
      renderLoading: () => "loading",
      renderError: (error) => `error:${error}`,
      renderEmpty: () => "empty",
      renderContent: (data) => data,
    });
    expect(container.children).toEqual(["loading"]);

    state.loading = false;
    state.error = "Broken";
    renderAsyncState(container, state, {
      renderLoading: () => "loading",
      renderError: (error) => `error:${error}`,
      renderEmpty: () => "empty",
      renderContent: (data) => data,
    });
    expect(container.children).toEqual(["error:Broken"]);

    state.error = null;
    state.data = [];
    renderAsyncState(container, state, {
      renderLoading: () => "loading",
      renderError: (error) => `error:${error}`,
      renderEmpty: () => "empty",
      renderContent: (data) => data,
    });
    expect(container.children).toEqual(["empty"]);

    state.data = ["content"];
    renderAsyncState(container, state, {
      renderLoading: () => "loading",
      renderError: (error) => `error:${error}`,
      renderEmpty: () => "empty",
      renderContent: (data) => data,
    });
    expect(container.children).toEqual(["content"]);
  });

  it("uses a custom emptiness predicate for object payloads", () => {
    const container = new FakeElement();
    const state = createAsyncState({ sections: [] as string[] });
    state.loading = false;

    renderAsyncState(container, state, {
      isEmpty: (data) => data.sections.length === 0,
      renderLoading: () => "loading",
      renderError: (error) => `error:${error}`,
      renderEmpty: () => "empty",
      renderContent: (data) => data.sections,
    });

    expect(container.children).toEqual(["empty"]);
  });
});
