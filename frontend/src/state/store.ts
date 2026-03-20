import type { RuntimeSnapshot } from "../types";

interface AppState {
  snapshot: RuntimeSnapshot | null;
  staleCount: number;
}

interface SnapshotMergeOptions {
  resetStale?: boolean;
}

interface SnapshotMergeResult {
  materialChanged: boolean;
  staleChanged: boolean;
  freshnessChanged: boolean;
}

export const APP_STATE_UPDATE_EVENT = "state:update";
export const APP_STATE_HEARTBEAT_EVENT = "state:heartbeat";

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
      // `generated_at` changes every poll; treat it as a heartbeat so heavy pages
      // only rerender when the runtime state actually changes.
      if (key === "generated_at") {
        if (target[key] !== value) {
          target[key] = value;
        }
        continue;
      }
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
  private state: AppState = { snapshot: null, staleCount: 0 };

  private dispatch(name: typeof APP_STATE_UPDATE_EVENT | typeof APP_STATE_HEARTBEAT_EVENT): void {
    window.dispatchEvent(new CustomEvent(name, { detail: this.state }));
  }

  private mergeSnapshotState(snapshot: RuntimeSnapshot, options: SnapshotMergeOptions): SnapshotMergeResult {
    const previousGeneratedAt = this.state.snapshot?.generated_at ?? null;
    let materialChanged: boolean;

    if (!this.state.snapshot) {
      this.state.snapshot = cloneValue(snapshot);
      materialChanged = true;
    } else {
      const result = mergeValue(this.state.snapshot, snapshot);
      materialChanged = result.changed;
    }

    const freshnessChanged = previousGeneratedAt !== snapshot.generated_at;
    const staleChanged = Boolean(options.resetStale && this.state.staleCount !== 0);
    if (staleChanged) {
      this.state.staleCount = 0;
    }
    return { materialChanged, staleChanged, freshnessChanged };
  }

  getState(): AppState {
    return this.state;
  }

  mergeSnapshot(snapshot: RuntimeSnapshot, options: SnapshotMergeOptions = {}): void {
    const result = this.mergeSnapshotState(snapshot, options);
    if (result.materialChanged || result.staleChanged) {
      this.dispatch(APP_STATE_UPDATE_EVENT);
      return;
    }
    if (result.freshnessChanged) {
      this.dispatch(APP_STATE_HEARTBEAT_EVENT);
    }
  }

  incrementStale(): void {
    this.state.staleCount += 1;
    this.dispatch(APP_STATE_UPDATE_EVENT);
  }

  resetStale(): void {
    if (this.state.staleCount === 0) {
      return;
    }
    this.state.staleCount = 0;
    this.dispatch(APP_STATE_UPDATE_EVENT);
  }
}

export { type AppState, StateStore };
export const store = new StateStore();
