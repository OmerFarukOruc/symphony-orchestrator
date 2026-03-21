import { api } from "../api";
import type { WorkflowColumn } from "../types";

interface DragState {
  draggedIdentifier: string | null;
  sourceColumnKey: string | null;
  transitionsCache: Record<string, string[]> | null;
}

export interface DragStateManager {
  onDragStart: (identifier: string, sourceColumnKey: string) => void;
  onDrop: (identifier: string, targetColumnKey: string, columns: WorkflowColumn[]) => Promise<void>;
  canDrop: (sourceColumnKey: string | null, targetColumnKey: string) => boolean;
  getTransitionsMap: () => Record<string, string[]> | null;
  prefetchTransitions: () => void;
}

export function createDragStateManager(): DragStateManager {
  const state: DragState = {
    draggedIdentifier: null,
    sourceColumnKey: null,
    transitionsCache: null,
  };

  function prefetchTransitions(): void {
    if (state.transitionsCache !== null) return;
    void api.getTransitions().then((result) => {
      state.transitionsCache = result.transitions;
    });
  }

  async function fetchTransitions(): Promise<Record<string, string[]>> {
    if (state.transitionsCache !== null) return state.transitionsCache;
    const result = await api.getTransitions();
    state.transitionsCache = result.transitions;
    return state.transitionsCache;
  }

  function onDragStart(identifier: string, sourceColumnKey: string): void {
    state.draggedIdentifier = identifier;
    state.sourceColumnKey = sourceColumnKey;
    prefetchTransitions();
  }

  async function onDrop(identifier: string, targetColumnKey: string, columns: WorkflowColumn[]): Promise<void> {
    const sourceColumn = columns.find((c) => c.issues.some((i) => i.identifier === identifier));
    if (!sourceColumn) return;

    const transitions = await fetchTransitions();
    const allowed = transitions[sourceColumn.key] ?? [];
    if (!allowed.includes(targetColumnKey)) {
      console.error(`Transition from ${sourceColumn.key} to ${targetColumnKey} is not allowed`);
      state.draggedIdentifier = null;
      state.sourceColumnKey = null;
      return;
    }

    const targetColumn = columns.find((c) => c.key === targetColumnKey);
    if (!targetColumn) return;

    try {
      await api.postTransition(identifier, targetColumn.label);
      void api.postRefresh();
    } catch (error) {
      console.error("Transition failed:", error);
    }
    state.draggedIdentifier = null;
    state.sourceColumnKey = null;
  }

  function canDrop(sourceColumnKey: string | null, targetColumnKey: string): boolean {
    if (!sourceColumnKey || !state.transitionsCache) return true; // optimistic until cache loads
    const allowed = state.transitionsCache[sourceColumnKey] ?? [];
    return allowed.includes(targetColumnKey);
  }

  function getTransitionsMap(): Record<string, string[]> | null {
    return state.transitionsCache;
  }

  return { onDragStart, onDrop, canDrop, getTransitionsMap, prefetchTransitions };
}
