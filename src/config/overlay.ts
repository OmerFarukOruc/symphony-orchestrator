import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import chokidar, { type FSWatcher } from "chokidar";
import YAML from "yaml";

import type { SymphonyLogger } from "../core/types.js";
import { isRecord, toErrorString } from "../utils/type-guards.js";
import {
  mergeOverlayMaps,
  normalizePathExpression,
  removeOverlayPathValue,
  setOverlayPathValue,
  stableStringify,
} from "./overlay-helpers.js";

function isDeepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

/**
 * Port interface for config overlay stores — implemented by both the file-backed
 * ConfigOverlayStore and the future DB-backed DbConfigStore.
 */
export interface ConfigOverlayPort {
  toMap(): Record<string, unknown>;
  applyPatch(patch: Record<string, unknown>): Promise<boolean>;
  set(pathExpression: string, value: unknown): Promise<boolean>;
  delete(pathExpression: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

export class ConfigOverlayStore implements ConfigOverlayPort {
  private overlay: Record<string, unknown> = {};
  private readonly listeners = new Set<() => void>();
  private watcher: FSWatcher | null = null;

  constructor(
    private readonly overlayPath: string,
    private readonly logger: SymphonyLogger,
  ) {}

  async start(): Promise<void> {
    await mkdir(path.dirname(this.overlayPath), { recursive: true });
    await this.reloadFromDisk("startup", { allowMissingFile: true });

    this.watcher = chokidar.watch(this.overlayPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });
    this.watcher.on("add", () => void this.reloadFromDisk("watch:add", { allowMissingFile: true }));
    this.watcher.on("change", () => void this.reloadFromDisk("watch:change", { allowMissingFile: true }));
    this.watcher.on("unlink", () => void this.reloadFromDisk("watch:unlink", { allowMissingFile: true }));
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  toMap(): Record<string, unknown> {
    return structuredClone(this.overlay) as Record<string, unknown>;
  }

  async replace(nextMap: Record<string, unknown>): Promise<boolean> {
    return this.commit(nextMap, "replace");
  }

  async applyPatch(patch: Record<string, unknown>): Promise<boolean> {
    return this.commit(mergeOverlayMaps(this.overlay, patch), "patch");
  }

  async set(pathExpression: string, value: unknown): Promise<boolean> {
    const segments = normalizePathExpression(pathExpression);
    if (segments.length === 0) {
      throw new Error("overlay path must contain at least one segment");
    }

    const next = this.toMap();
    setOverlayPathValue(next, segments, value, { dangerousKeyMode: "throw" });
    return this.commit(next, `set:${pathExpression}`);
  }

  async delete(pathExpression: string): Promise<boolean> {
    const segments = normalizePathExpression(pathExpression);
    if (segments.length === 0) {
      throw new Error("overlay path must contain at least one segment");
    }

    const next = this.toMap();
    const removed = removeOverlayPathValue(next, segments, { dangerousKeyMode: "throw" });
    if (!removed) {
      return false;
    }
    await this.commit(next, `delete:${pathExpression}`);
    return true;
  }

  private async commit(nextMap: Record<string, unknown>, reason: string): Promise<boolean> {
    if (isDeepEqual(nextMap, this.overlay)) {
      return false;
    }

    this.overlay = structuredClone(nextMap) as Record<string, unknown>;
    await this.persist();
    this.logger.info({ reason, overlayPath: this.overlayPath }, "config overlay updated");
    this.notify();
    return true;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async persist(): Promise<void> {
    const rendered = YAML.stringify(this.overlay);
    const dir = path.dirname(this.overlayPath);

    for (let attempt = 0; attempt < 2; attempt++) {
      const temporaryPath = `${this.overlayPath}.tmp-${process.pid}-${Date.now()}`;
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(temporaryPath, rendered, "utf8");
        await rename(temporaryPath, this.overlayPath);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" && attempt === 0) {
          this.logger.warn({ error: toErrorString(error) }, "config overlay persist retrying after ENOENT");
          continue;
        }
        throw error;
      }
    }
  }

  private async reloadFromDisk(reason: string, options: { allowMissingFile: boolean }): Promise<void> {
    let source: string | null;
    try {
      source = await readFile(this.overlayPath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" && options.allowMissingFile) {
        source = null;
      } else {
        this.logger.warn({ error: toErrorString(error), reason }, "config overlay read failed");
        return;
      }
    }

    let nextMap: unknown;
    try {
      const parsed = source === null ? {} : YAML.parse(source);
      nextMap = parsed === null ? {} : parsed;
    } catch (error) {
      this.logger.warn(
        { reason, overlayPath: this.overlayPath, error: toErrorString(error) },
        "config overlay parse failed",
      );
      return;
    }
    if (!isRecord(nextMap)) {
      this.logger.warn({ reason, overlayPath: this.overlayPath }, "config overlay root must be a YAML map");
      return;
    }

    if (isDeepEqual(this.overlay, nextMap)) {
      return;
    }

    this.overlay = structuredClone(nextMap) as Record<string, unknown>;
    this.logger.info({ reason, overlayPath: this.overlayPath }, "config overlay reloaded");
    this.notify();
  }
}
