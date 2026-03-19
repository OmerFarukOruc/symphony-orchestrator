import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import chokidar, { type FSWatcher } from "chokidar";
import YAML from "yaml";

import type { SymphonyLogger } from "../core/types.js";
import { isRecord } from "../utils/type-guards.js";

const dangerousKeys = new Set(["__proto__", "constructor", "prototype"]);

function isDangerousKey(key: string): boolean {
  return dangerousKeys.has(key);
}

function normalizePath(pathExpression: string): string[] {
  return pathExpression
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForStableStringify);
  }
  if (!isRecord(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    sorted[key] = sortForStableStringify(value[key]);
  }
  return sorted;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function removeAtPath(target: Record<string, unknown>, segments: string[]): boolean {
  if (segments.length === 0) {
    return false;
  }

  const [head, ...tail] = segments;
  if (isDangerousKey(head)) {
    throw new TypeError(`Refusing to traverse dangerous key: ${head}`);
  }
  if (tail.length === 0) {
    if (!(head in target)) {
      return false;
    }
    delete target[head];
    return true;
  }

  const child = target[head];
  if (!isRecord(child)) {
    return false;
  }

  const removed = removeAtPath(child, tail);
  if (removed && Object.keys(child).length === 0) {
    delete target[head];
  }
  return removed;
}

function setAtPath(target: Record<string, unknown>, segments: string[], value: unknown): void {
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (isDangerousKey(key)) {
      throw new TypeError(`Refusing to traverse dangerous key: ${key}`);
    }
    const child = cursor[key];
    if (!isRecord(child)) {
      const next: Record<string, unknown> = {};
      cursor[key] = next;
      cursor = next;
      continue;
    }
    cursor = child;
  }

  const leafKey = segments.at(-1)!;
  if (isDangerousKey(leafKey)) {
    throw new TypeError(`Refusing to set dangerous key: ${leafKey}`);
  }
  cursor[leafKey] = value;
}

function mergeDeep(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const output = structuredClone(base) as Record<string, unknown>;

  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = output[key];
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
    return this.commit(mergeDeep(this.overlay, patch), "patch");
  }

  async set(pathExpression: string, value: unknown): Promise<boolean> {
    const segments = normalizePath(pathExpression);
    if (segments.length === 0) {
      throw new Error("overlay path must contain at least one segment");
    }

    const next = this.toMap();
    setAtPath(next, segments, value);
    return this.commit(next, `set:${pathExpression}`);
  }

  async delete(pathExpression: string): Promise<boolean> {
    const segments = normalizePath(pathExpression);
    if (segments.length === 0) {
      throw new Error("overlay path must contain at least one segment");
    }

    const next = this.toMap();
    const removed = removeAtPath(next, segments);
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
    const temporaryPath = `${this.overlayPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryPath, rendered, "utf8");
    await rename(temporaryPath, this.overlayPath);
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
        this.logger.warn({ error: String(error), reason }, "config overlay read failed");
        return;
      }
    }

    let nextMap: unknown;
    try {
      const parsed = source === null ? {} : YAML.parse(source);
      nextMap = parsed === null ? {} : parsed;
    } catch (error) {
      this.logger.warn({ reason, overlayPath: this.overlayPath, error: String(error) }, "config overlay parse failed");
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
