/**
 * DB-backed config overlay store.
 *
 * Implements ConfigOverlayPort (toMap, applyPatch, set, delete, subscribe)
 * using the SQLite `config` table with section JSON documents.
 *
 * Also provides `getWorkflow()` and `getConfig()` so it can serve as the
 * backing store for ConfigStore in DB-first mode.
 */

import { eq } from "drizzle-orm";

import type { ConfigOverlayPort } from "./overlay.js";
import type { SymphonyDatabase } from "../persistence/sqlite/database.js";
import { config, promptTemplates } from "../persistence/sqlite/schema.js";
import type { SymphonyLogger, WorkflowDefinition, ServiceConfig, ValidationError } from "../core/types.js";
import { isRecord } from "../utils/type-guards.js";
import { deriveServiceConfig } from "./builders.js";
import { collectDispatchWarnings, validateDispatch } from "./validators.js";
import { DEFAULT_PROMPT_TEMPLATE } from "./defaults.js";
import type { SecretsStore } from "../secrets/store.js";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableStringify);
  if (!value || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortForStableStringify((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

/**
 * Read all section rows and reconstruct a flat config map that
 * looks identical to what YAML front matter would produce.
 */
function readConfigMap(db: SymphonyDatabase): Record<string, unknown> {
  const rows = db.select().from(config).all();
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = {};
    }
  }
  return map;
}

/**
 * Read the active prompt template body from the DB.
 */
function readActiveTemplate(db: SymphonyDatabase): string {
  // 1. Check system.selectedTemplateId
  const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
  if (systemRow) {
    const system = JSON.parse(systemRow.value) as Record<string, unknown>;
    const selectedId = system.selectedTemplateId;
    if (typeof selectedId === "string") {
      const template = db.select().from(promptTemplates).where(eq(promptTemplates.id, selectedId)).get();
      if (template) return template.body;
    }
  }

  // 2. Fallback: first template in table
  const fallback = db.select().from(promptTemplates).limit(1).get();
  if (fallback) return fallback.body;

  // 3. Hardcoded default
  return DEFAULT_PROMPT_TEMPLATE;
}

/**
 * Normalize a dotted path expression into segments.
 */
function normalizePath(pathExpression: string): string[] {
  return pathExpression
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Deep-merge two records (overlay semantics: arrays replace, objects merge).
 */
function mergeDeep(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const output = structuredClone(base) as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    if (DANGEROUS_KEYS.has(key)) continue;
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

/**
 * Set a value at a dotted path inside a nested object.
 */
function setAtPath(target: Record<string, unknown>, segments: string[], value: unknown): void {
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index++) {
    const key = segments[index];
    if (DANGEROUS_KEYS.has(key)) return;
    const child = Object.hasOwn(cursor, key) ? cursor[key] : undefined;
    if (!isRecord(child)) {
      const next: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      cursor[key] = next;
      cursor = next;
      continue;
    }
    cursor = child;
  }
  const leafKey = segments.at(-1)!;
  if (DANGEROUS_KEYS.has(leafKey)) return;
  cursor[leafKey] = value;
}

/**
 * Remove a value at a dotted path inside a nested object.
 */
function removeAtPath(target: Record<string, unknown>, segments: string[]): boolean {
  if (segments.length === 0) return false;
  const [head, ...tail] = segments;
  if (DANGEROUS_KEYS.has(head)) return false;
  if (tail.length === 0) {
    if (!Object.hasOwn(target, head)) return false;
    delete target[head];
    return true;
  }
  const child = Object.hasOwn(target, head) ? target[head] : undefined;
  if (!isRecord(child)) return false;
  const removed = removeAtPath(child, tail);
  if (removed && Object.keys(child).length === 0) {
    delete target[head];
  }
  return removed;
}

export class DbConfigStore implements ConfigOverlayPort {
  private cachedMap: Record<string, unknown> = {};
  private cachedConfig: ServiceConfig | null = null;
  private cachedWorkflow: WorkflowDefinition | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly db: SymphonyDatabase,
    private readonly logger: SymphonyLogger,
    private readonly deps?: {
      secretsStore?: Pick<SecretsStore, "get" | "subscribe">;
    },
  ) {}

  /**
   * Load config from DB and derive ServiceConfig. Called on startup
   * and after every mutation.
   */
  refresh(): void {
    const configMap = readConfigMap(this.db);
    const promptTemplate = readActiveTemplate(this.db);

    const workflow: WorkflowDefinition = { config: configMap, promptTemplate };
    const serviceConfig = deriveServiceConfig(workflow, {
      secretResolver: (name) => this.deps?.secretsStore?.get(name) ?? undefined,
    });

    this.cachedMap = configMap;
    this.cachedConfig = serviceConfig;
    this.cachedWorkflow = workflow;
    this.logger.info("config refreshed from DB");

    for (const warning of collectDispatchWarnings(serviceConfig)) {
      this.logger.warn({ code: warning.code }, warning.message);
    }
  }

  // --- ConfigStore-compatible surface ---

  getWorkflow(): WorkflowDefinition {
    if (!this.cachedWorkflow) throw new Error("DbConfigStore not started — call refresh() first");
    return this.cachedWorkflow;
  }

  getConfig(): ServiceConfig {
    if (!this.cachedConfig) throw new Error("DbConfigStore not started — call refresh() first");
    return this.cachedConfig;
  }

  getMergedConfigMap(): Record<string, unknown> {
    return structuredClone(this.cachedMap) as Record<string, unknown>;
  }

  validateDispatch(): ValidationError | null {
    return validateDispatch(this.getConfig());
  }

  // --- ConfigOverlayPort implementation ---

  toMap(): Record<string, unknown> {
    return structuredClone(this.cachedMap) as Record<string, unknown>;
  }

  async applyPatch(patch: Record<string, unknown>): Promise<boolean> {
    const currentMap = this.toMap();
    const merged = mergeDeep(currentMap, patch);

    if (stableStringify(merged) === stableStringify(currentMap)) return false;

    this.writeSections(merged);
    this.refresh();
    this.notify();
    return true;
  }

  async set(pathExpression: string, value: unknown): Promise<boolean> {
    const segments = normalizePath(pathExpression);
    if (segments.length === 0) throw new Error("overlay path must contain at least one segment");

    const currentMap = this.toMap();
    setAtPath(currentMap, segments, value);
    this.writeSections(currentMap);
    this.refresh();
    this.notify();
    return true;
  }

  async delete(pathExpression: string): Promise<boolean> {
    const segments = normalizePath(pathExpression);
    if (segments.length === 0) throw new Error("overlay path must contain at least one segment");

    const currentMap = this.toMap();
    const removed = removeAtPath(currentMap, segments);
    if (!removed) return false;

    this.writeSections(currentMap);
    this.refresh();
    this.notify();
    return true;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // --- Internal helpers ---

  private writeSections(map: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const mapKeys = new Set<string>();

    for (const [key, value] of Object.entries(map)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      mapKeys.add(key);
      const serialized = JSON.stringify(value);
      const existing = this.db.select().from(config).where(eq(config.key, key)).get();
      if (existing) {
        this.db.update(config).set({ value: serialized, updatedAt: now }).where(eq(config.key, key)).run();
      } else {
        this.db.insert(config).values({ key, value: serialized, updatedAt: now }).run();
      }
    }

    // Remove DB rows for keys no longer present in the map.
    const allRows = this.db.select({ key: config.key }).from(config).all();
    for (const row of allRows) {
      if (!mapKeys.has(row.key)) {
        this.db.delete(config).where(eq(config.key, row.key)).run();
      }
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
