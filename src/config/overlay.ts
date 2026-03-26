import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { SymphonyLogger } from "../core/types.js";
import { ConfigStoreSqlite } from "../db/config-store-sqlite.js";
import {
  flattenOverlayMap,
  isDangerousKey,
  isOverlayEqual,
  normalizeOverlayPath,
  removeOverlayValue,
  setOverlayValue,
} from "./overlay-map.js";
import type { ConfigOverlayEntry } from "./overlay-map.js";
import { isRecord } from "../utils/type-guards.js";

function cloneOverlayMap(map: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(map) as Record<string, unknown>;
}

function mergeDeep(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const output = structuredClone(base) as Record<string, unknown>;

  for (const key of Object.keys(patch)) {
    if (isDangerousKey(key)) continue;
    const patchValue = patch[key];
    const baseValue = Object.hasOwn(output, key) ? output[key] : undefined;
    if (isRecord(baseValue) && isRecord(patchValue)) {
      output[key] = mergeDeep(baseValue, patchValue);
      continue;
    }
    output[key] = structuredClone(patchValue);
  }

  return output;
}

export class ConfigOverlayStore {
  private overlay: Record<string, unknown> = {};
  private readonly listeners = new Set<() => void>();
  private readonly sqliteStore: ConfigStoreSqlite;

  constructor(
    private readonly overlayPath: string,
    private readonly logger: SymphonyLogger,
  ) {
    const archiveDir = path.dirname(path.dirname(this.overlayPath));
    this.sqliteStore = new ConfigStoreSqlite(archiveDir, this.logger.child({ component: "config-overlay-sqlite" }));
  }

  async start(): Promise<void> {
    await mkdir(path.dirname(this.overlayPath), { recursive: true });
    this.overlay = cloneOverlayMap(await this.sqliteStore.load());
  }

  async stop(): Promise<void> {
    this.sqliteStore.close();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  toMap(): Record<string, unknown> {
    return cloneOverlayMap(this.overlay);
  }

  async replace(nextMap: Record<string, unknown>): Promise<boolean> {
    return this.commit(nextMap, "replace");
  }

  async applyPatch(patch: Record<string, unknown>): Promise<boolean> {
    return this.commit(mergeDeep(this.overlay, patch), "patch");
  }

  async set(pathExpression: string, value: unknown): Promise<boolean> {
    const segments = normalizeOverlayPath(pathExpression);
    if (segments.length === 0) {
      throw new Error("overlay path must contain at least one segment");
    }

    const next = this.toMap();
    setOverlayValue(next, segments, value);
    return this.commit(next, `set:${pathExpression}`);
  }

  async delete(pathExpression: string): Promise<boolean> {
    const segments = normalizeOverlayPath(pathExpression);
    if (segments.length === 0) {
      throw new Error("overlay path must contain at least one segment");
    }

    const next = this.toMap();
    const removed = removeOverlayValue(next, segments);
    if (!removed) {
      return false;
    }
    await this.commit(next, `delete:${pathExpression}`);
    return true;
  }

  /**
   * Atomically apply multiple set/delete operations in a single persist cycle.
   *
   * This prevents the race condition where sequential `set()` calls each persist
   * the overlay file independently, allowing chokidar to reload partial state
   * between calls.
   */
  async setBatch(entries: Array<{ path: string; value: unknown }>, deletions?: string[]): Promise<boolean> {
    const next = this.toMap();

    for (const entry of entries) {
      const segments = normalizeOverlayPath(entry.path);
      if (segments.length === 0) {
        throw new Error("overlay path must contain at least one segment");
      }
      setOverlayValue(next, segments, entry.value);
    }

    for (const pathExpression of deletions ?? []) {
      const segments = normalizeOverlayPath(pathExpression);
      if (segments.length === 0) {
        throw new Error("overlay path must contain at least one segment");
      }
      removeOverlayValue(next, segments);
    }

    const paths = entries.map((e) => e.path);
    if (deletions?.length) {
      paths.push(...deletions.map((d) => `-${d}`));
    }
    return this.commit(next, `setBatch:${paths.join(",")}`);
  }

  private async commit(nextMap: Record<string, unknown>, reason: string): Promise<boolean> {
    if (isOverlayEqual(nextMap, this.overlay)) {
      return false;
    }

    await this.sqliteStore.replaceAll(this.toEntries(nextMap));
    this.overlay = cloneOverlayMap(nextMap);
    this.logger.info({ reason, overlayPath: this.overlayPath }, "config overlay updated");
    this.notify();
    return true;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private toEntries(map: Record<string, unknown>): ConfigOverlayEntry[] {
    return flattenOverlayMap(map);
  }
}
