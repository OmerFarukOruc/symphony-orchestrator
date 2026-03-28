/**
 * One-time legacy import: WORKFLOW.md + overlay.yaml + secrets.enc → DB.
 *
 * On first boot with an empty config table, this module checks for
 * legacy files and imports their state into SQLite. After import,
 * legacy files are never live-read again.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";
import { eq } from "drizzle-orm";

import type { SymphonyDatabase } from "../persistence/sqlite/database.js";
import { config, promptTemplates } from "../persistence/sqlite/schema.js";
import type { SymphonyLogger } from "../core/types.js";
import { loadWorkflowDefinition } from "../workflow/loader.js";
import { isRecord } from "../utils/type-guards.js";
import { DEFAULT_CONFIG_SECTIONS, DEFAULT_PROMPT_TEMPLATE } from "./defaults.js";
import { deepMerge } from "./merge.js";

interface ImportResult {
  imported: boolean;
  sources: string[];
  sectionCount: number;
}

/**
 * Seed default config sections into the DB if the config table is empty.
 */
export function seedDefaults(db: SymphonyDatabase): void {
  const existing = db.select().from(config).limit(1).all();
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(DEFAULT_CONFIG_SECTIONS)) {
    db.insert(config)
      .values({ key, value: JSON.stringify(value), updatedAt: now })
      .onConflictDoNothing()
      .run();
  }

  // Seed default prompt template
  const existingTemplates = db.select().from(promptTemplates).limit(1).all();
  if (existingTemplates.length === 0) {
    db.insert(promptTemplates)
      .values({
        id: "default",
        name: "Default",
        body: DEFAULT_PROMPT_TEMPLATE,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();

    // Set the selected template in system config
    const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
    if (systemRow) {
      const systemConfig = JSON.parse(systemRow.value) as Record<string, unknown>;
      systemConfig.selectedTemplateId = "default";
      db.update(config)
        .set({ value: JSON.stringify(systemConfig), updatedAt: now })
        .where(eq(config.key, "system"))
        .run();
    }
  }
}

/**
 * Import legacy files into the DB. Only runs once — guarded by
 * system.legacyImportVersion in the config table.
 */
function isAlreadyImported(db: SymphonyDatabase): boolean {
  const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
  if (!systemRow) return false;
  const systemConfig = JSON.parse(systemRow.value) as Record<string, unknown>;
  return systemConfig.legacyImportVersion != null;
}

async function loadWorkflowSource(
  workflowPath: string | null | undefined,
  dataDir: string,
  logger: SymphonyLogger,
): Promise<{ merged: Record<string, unknown>; promptBody: string | null; sources: string[] }> {
  const sources: string[] = [];
  let merged: Record<string, unknown> = {};
  let promptBody: string | null = null;

  const resolvedPath = workflowPath ?? findLegacyWorkflow(dataDir);
  if (resolvedPath) {
    try {
      const workflow = await loadWorkflowDefinition(resolvedPath);
      merged = { ...workflow.config };
      if (workflow.promptTemplate?.trim()) {
        promptBody = workflow.promptTemplate;
      }
      sources.push(resolvedPath);
      logger.info({ path: resolvedPath }, "imported WORKFLOW.md config");
    } catch (error) {
      logger.warn({ path: resolvedPath, error: String(error) }, "failed to import WORKFLOW.md");
    }
  }

  return { merged, promptBody, sources };
}

async function loadOverlaySource(
  dataDir: string,
  base: Record<string, unknown>,
  logger: SymphonyLogger,
): Promise<{ merged: Record<string, unknown>; overlayPath: string | null }> {
  const overlayPath = path.join(dataDir, "config-overlay.yaml");
  try {
    const overlayText = await readFile(overlayPath, "utf8");
    const overlayData = YAML.parse(overlayText);
    if (isRecord(overlayData)) {
      logger.info({ path: overlayPath }, "imported overlay.yaml");
      return { merged: deepMerge(base, overlayData) as Record<string, unknown>, overlayPath };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn({ path: overlayPath, error: String(error) }, "failed to import overlay.yaml");
    }
  }
  return { merged: base, overlayPath: null };
}

function writeSectionRows(db: SymphonyDatabase, merged: Record<string, unknown>, now: string): number {
  let count = 0;
  for (const sectionKey of Object.keys(DEFAULT_CONFIG_SECTIONS)) {
    if (sectionKey === "system") continue;
    const sectionValue = merged[sectionKey];
    if (sectionValue === undefined) continue;
    const mergedSection = isRecord(sectionValue)
      ? deepMerge(DEFAULT_CONFIG_SECTIONS[sectionKey], sectionValue)
      : sectionValue;
    db.update(config)
      .set({ value: JSON.stringify(mergedSection), updatedAt: now })
      .where(eq(config.key, sectionKey))
      .run();
    count++;
  }
  return count;
}

function recordImportMetadata(db: SymphonyDatabase, sources: string[], now: string): void {
  const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
  const currentSystem = systemRow ? (JSON.parse(systemRow.value) as Record<string, unknown>) : {};
  currentSystem.legacyImportVersion = 1;
  currentSystem.lastImportedFrom = sources;
  db.update(config)
    .set({ value: JSON.stringify(currentSystem), updatedAt: now })
    .where(eq(config.key, "system"))
    .run();
}

/**
 * Import legacy files into the DB. Only runs once — guarded by
 * system.legacyImportVersion in the config table.
 */
export async function importLegacyFiles(
  db: SymphonyDatabase,
  dataDir: string,
  logger: SymphonyLogger,
  workflowPath?: string | null,
): Promise<ImportResult> {
  if (isAlreadyImported(db)) {
    return { imported: false, sources: [], sectionCount: 0 };
  }

  const workflow = await loadWorkflowSource(workflowPath, dataDir, logger);
  const overlay = await loadOverlaySource(dataDir, workflow.merged, logger);

  const allSources = [...workflow.sources];
  if (overlay.overlayPath) allSources.push(overlay.overlayPath);

  if (allSources.length === 0) {
    return { imported: false, sources: [], sectionCount: 0 };
  }

  const now = new Date().toISOString();
  const sectionCount = writeSectionRows(db, overlay.merged, now);

  if (workflow.promptBody) {
    db.update(promptTemplates)
      .set({ body: workflow.promptBody, updatedAt: now })
      .where(eq(promptTemplates.id, "default"))
      .run();
  }

  recordImportMetadata(db, allSources, now);
  logger.info({ sources: allSources, sectionCount }, "legacy import completed");
  return { imported: true, sources: allSources, sectionCount };
}

/**
 * Look for a WORKFLOW.md in common locations relative to dataDir.
 */
function findLegacyWorkflow(dataDir: string): string | null {
  // dataDir is typically .symphony/ — WORKFLOW.md is one level up
  const parentDir = path.dirname(dataDir);
  const candidates = [
    path.join(parentDir, "WORKFLOW.md"),
    path.join(parentDir, "WORKFLOW.yaml"),
    path.join(parentDir, "WORKFLOW.yml"),
  ];

  // Synchronous existence check — fine for one-time startup
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").accessSync(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
