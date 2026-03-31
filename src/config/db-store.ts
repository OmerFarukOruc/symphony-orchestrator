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
import type { RisolutoDatabase } from "../persistence/sqlite/database.js";
import { config, promptTemplates } from "../persistence/sqlite/schema.js";
import type { RisolutoLogger, WorkflowDefinition, ServiceConfig, ValidationError } from "../core/types.js";
import { deriveServiceConfig } from "./builders.js";
import { collectDispatchWarnings, validateDispatch } from "./validators.js";
import { DEFAULT_PROMPT_TEMPLATE } from "./defaults.js";
import type { SecretsStore } from "../secrets/store.js";
import {
  isDangerousKey,
  mergeOverlayMaps,
  normalizePathExpression,
  removeOverlayPathValue,
  setOverlayPathValue,
  stableStringify,
} from "./overlay-helpers.js";

/**
 * Read all section rows and reconstruct a flat config map that
 * looks identical to what YAML front matter would produce.
 */
function readConfigMap(db: RisolutoDatabase): Record<string, unknown> {
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
function readActiveTemplate(db: RisolutoDatabase): string {
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

export class DbConfigStore implements ConfigOverlayPort {
  private cachedMap: Record<string, unknown> = {};
  private cachedConfig: ServiceConfig | null = null;
  private cachedWorkflow: WorkflowDefinition | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly db: RisolutoDatabase,
    private readonly logger: RisolutoLogger,
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
    const merged = mergeOverlayMaps(currentMap, patch);

    if (stableStringify(merged) === stableStringify(currentMap)) return false;

    this.writeSections(merged);
    this.refresh();
    this.notify();
    return true;
  }

  async set(pathExpression: string, value: unknown): Promise<boolean> {
    const segments = normalizePathExpression(pathExpression);
    if (segments.length === 0) throw new Error("overlay path must contain at least one segment");

    const before = this.toMap();
    const after = this.toMap();
    setOverlayPathValue(after, segments, value);
    if (stableStringify(after) === stableStringify(before)) return false;

    this.writeSections(after);
    this.refresh();
    this.notify();
    return true;
  }

  async delete(pathExpression: string): Promise<boolean> {
    const segments = normalizePathExpression(pathExpression);
    if (segments.length === 0) throw new Error("overlay path must contain at least one segment");

    const currentMap = this.toMap();
    const removed = removeOverlayPathValue(currentMap, segments);
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
      if (isDangerousKey(key)) continue;
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
