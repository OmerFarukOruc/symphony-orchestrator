import type { RuntimeSnapshot } from "../types";

interface AppState {
  snapshot: RuntimeSnapshot | null;
  staleCount: number;
  lastUpdated: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function mergeValue(target: unknown, source: unknown): { value: unknown; changed: boolean } {
  if (Array.isArray(target) && Array.isArray(source)) {
    if (JSON.stringify(target) !== JSON.stringify(source)) {
      target.splice(0, target.length, ...cloneValue(source));
      return { value: target, changed: true };
    }
    return { value: target, changed: false };
  }
  if (isObject(target) && isObject(source)) {
    let anyChanged = false;
    for (const [key, value] of Object.entries(source)) {
      const current = target[key];
      if (Array.isArray(value) || isObject(value)) {
        target[key] = current ?? cloneValue(value);
        const result = mergeValue(target[key], value);
        target[key] = result.value;
        if (result.changed) anyChanged = true;
        continue;
      }
      if (current !== value) {
        target[key] = value;
        anyChanged = true;
      }
    }
    return { value: target, changed: anyChanged };
  }
  return { value: source, changed: target !== source };
}

class StateStore {
  private state: AppState = { snapshot: null, staleCount: 0, lastUpdated: 0 };

  getState(): AppState {
    return this.state;
  }

  mergeSnapshot(snapshot: RuntimeSnapshot): void {
    if (!this.state.snapshot) {
      this.state.snapshot = cloneValue(snapshot);
      this.state.lastUpdated = Date.now();
      window.dispatchEvent(new CustomEvent("state:update", { detail: this.state }));
      return;
    }
    const result = mergeValue(this.state.snapshot, snapshot);
    if (result.changed) {
      this.state.lastUpdated = Date.now();
      window.dispatchEvent(new CustomEvent("state:update", { detail: this.state }));
    }
  }

  incrementStale(): void {
    this.state.staleCount += 1;
    window.dispatchEvent(new CustomEvent("state:update", { detail: this.state }));
  }

  resetStale(): void {
    this.state.staleCount = 0;
    window.dispatchEvent(new CustomEvent("state:update", { detail: this.state }));
  }
}

export { type AppState, StateStore };
export const store = new StateStore();
