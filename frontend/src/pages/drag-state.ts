import { api } from "../api";
import type { WorkflowColumn } from "../types";
import { toast } from "../ui/toast";

interface DragState {
  draggedIdentifier: string | null;
  sourceColumnKey: string | null;
  transitionsCache: Record<string, string[]> | null;
  ghostEl: HTMLElement | null;
  detachGhostTracking: (() => void) | null;
}

interface DragStartOptions {
  sourceEl: HTMLElement;
  x: number;
  y: number;
}

function notify(message: string, type: "success" | "error" | "info"): void {
  if (typeof document === "undefined") return;
  toast(message, type);
}

export interface DragStateManager {
  onDragStart: (identifier: string, sourceColumnKey: string, options?: DragStartOptions) => void;
  onDragEnd: () => void;
  onDrop: (identifier: string, targetColumnKey: string, columns: WorkflowColumn[]) => Promise<void>;
  moveByOffset: (
    identifier: string,
    sourceColumnKey: string,
    offset: -1 | 1,
    columns: WorkflowColumn[],
  ) => Promise<boolean>;
  canDrop: (sourceColumnKey: string | null, targetColumnKey: string) => boolean;
  getTransitionsMap: () => Record<string, string[]> | null;
  prefetchTransitions: () => void;
}

function createGhostElement(sourceEl: HTMLElement): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "kanban-drag-ghost";

  const identifier = sourceEl.querySelector(".kanban-card-identifier")?.textContent ?? "Issue";
  const title = sourceEl.querySelector(".kanban-card-title")?.textContent ?? "Moving issue";
  const identifierEl = document.createElement("strong");
  identifierEl.className = "kanban-drag-ghost-id";
  identifierEl.textContent = identifier;
  const titleEl = document.createElement("span");
  titleEl.className = "kanban-drag-ghost-title";
  titleEl.textContent = title;
  ghost.append(identifierEl, titleEl);

  return ghost;
}

const DRAG_GHOST_OFFSET = 16;

function positionGhost(ghostEl: HTMLElement, x: number, y: number): void {
  ghostEl.style.transform = `translate(${x + DRAG_GHOST_OFFSET}px, ${y + DRAG_GHOST_OFFSET}px)`;
}

export function createDragStateManager(): DragStateManager {
  const state: DragState = {
    draggedIdentifier: null,
    sourceColumnKey: null,
    transitionsCache: null,
    ghostEl: null,
    detachGhostTracking: null,
  };

  function clearGhost(): void {
    state.detachGhostTracking?.();
    state.detachGhostTracking = null;
    state.ghostEl?.remove();
    state.ghostEl = null;
  }

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

  function onDragStart(identifier: string, sourceColumnKey: string, options?: DragStartOptions): void {
    state.draggedIdentifier = identifier;
    state.sourceColumnKey = sourceColumnKey;
    prefetchTransitions();

    if (!options) {
      return;
    }

    clearGhost();
    const ghostEl = createGhostElement(options.sourceEl);
    document.body.append(ghostEl);
    positionGhost(ghostEl, options.x, options.y);
    const trackGhost = (event: DragEvent): void => {
      positionGhost(ghostEl, event.clientX, event.clientY);
    };
    document.addEventListener("dragover", trackGhost);
    state.detachGhostTracking = () => {
      document.removeEventListener("dragover", trackGhost);
    };
    state.ghostEl = ghostEl;
  }

  function onDragEnd(): void {
    clearGhost();
    state.draggedIdentifier = null;
    state.sourceColumnKey = null;
  }

  async function performTransition(
    identifier: string,
    sourceColumnKey: string,
    targetColumnKey: string,
    columns: WorkflowColumn[],
  ): Promise<boolean> {
    const transitions = await fetchTransitions();
    const allowed = transitions[sourceColumnKey] ?? [];
    if (!allowed.includes(targetColumnKey)) {
      console.error(`Transition from ${sourceColumnKey} to ${targetColumnKey} is not allowed`);
      notify("That transition is not allowed.", "error");
      return false;
    }

    const targetColumn = columns.find((column) => column.key === targetColumnKey);
    if (!targetColumn) {
      return false;
    }

    try {
      await api.postTransition(identifier, targetColumn.label);
      void api.postRefresh();
      return true;
    } catch (error) {
      console.error("Transition failed:", error);
      notify(error instanceof Error ? error.message : "Failed to move issue.", "error");
      return false;
    }
  }

  async function onDrop(identifier: string, targetColumnKey: string, columns: WorkflowColumn[]): Promise<void> {
    const sourceColumn = columns.find((c) => c.issues.some((i) => i.identifier === identifier));
    onDragEnd();
    if (!sourceColumn) {
      return;
    }

    await performTransition(identifier, sourceColumn.key, targetColumnKey, columns);
  }

  async function moveByOffset(
    identifier: string,
    sourceColumnKey: string,
    offset: -1 | 1,
    columns: WorkflowColumn[],
  ): Promise<boolean> {
    const sourceIndex = columns.findIndex((column) => column.key === sourceColumnKey);
    if (sourceIndex === -1) {
      return false;
    }

    const transitions = await fetchTransitions();
    const allowed = transitions[sourceColumnKey] ?? [];
    for (let index = sourceIndex + offset; index >= 0 && index < columns.length; index += offset) {
      const targetColumn = columns[index];
      if (!allowed.includes(targetColumn.key)) {
        continue;
      }
      return performTransition(identifier, sourceColumnKey, targetColumn.key, columns);
    }

    notify(offset < 0 ? "No valid previous column." : "No valid next column.", "info");
    return false;
  }

  function canDrop(sourceColumnKey: string | null, targetColumnKey: string): boolean {
    if (!sourceColumnKey || !state.transitionsCache) return true; // optimistic until cache loads
    const allowed = state.transitionsCache[sourceColumnKey] ?? [];
    return allowed.includes(targetColumnKey);
  }

  function getTransitionsMap(): Record<string, string[]> | null {
    return state.transitionsCache;
  }

  return { onDragStart, onDragEnd, onDrop, moveByOffset, canDrop, getTransitionsMap, prefetchTransitions };
}
