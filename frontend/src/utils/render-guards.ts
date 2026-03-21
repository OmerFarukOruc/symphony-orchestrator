import type { AsyncState } from "./async-state.js";

type RenderableChild = Node | string;

interface ReplaceChildrenTarget {
  replaceChildren(...nodes: RenderableChild[]): void;
}

export interface RenderAsyncStateOptions<T> {
  renderLoading: () => RenderableChild | RenderableChild[];
  renderError: (error: string) => RenderableChild | RenderableChild[];
  renderEmpty: (data: T | null) => RenderableChild | RenderableChild[];
  renderContent: (data: T) => RenderableChild | RenderableChild[];
  isEmpty?: (data: T) => boolean;
}

export function renderAsyncState<T>(
  container: ReplaceChildrenTarget,
  state: AsyncState<T>,
  options: RenderAsyncStateOptions<T>,
): void {
  if (state.loading) {
    container.replaceChildren(...toChildren(options.renderLoading()));
    return;
  }
  if (state.error) {
    container.replaceChildren(...toChildren(options.renderError(state.error)));
    return;
  }
  if (state.data === null || isEmptyState(state.data, options.isEmpty)) {
    container.replaceChildren(...toChildren(options.renderEmpty(state.data)));
    return;
  }
  container.replaceChildren(...toChildren(options.renderContent(state.data)));
}

function isEmptyState<T>(data: T, isEmpty?: (data: T) => boolean): boolean {
  if (isEmpty) {
    return isEmpty(data);
  }
  if (typeof data === "string" || Array.isArray(data)) {
    return data.length === 0;
  }
  if (data instanceof Map || data instanceof Set) {
    return data.size === 0;
  }
  if (typeof data === "object" && data !== null) {
    return Object.keys(data).length === 0;
  }
  return false;
}

function toChildren(value: RenderableChild | RenderableChild[]): RenderableChild[] {
  return Array.isArray(value) ? value : [value];
}
