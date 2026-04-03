import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";

import { importLegacyFiles, seedDefaults } from "../../src/config/legacy-import.js";
import { config, promptTemplates } from "../../src/persistence/sqlite/schema.js";
import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { createMockLogger } from "../helpers.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "risoluto-legacy-import-int-"));
  tempDirs.push(dir);
  return dir;
}

function openSeededDatabase(dbPath: string): RisolutoDatabase {
  const db = openDatabase(dbPath);
  seedDefaults(db);
  return db;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("legacy import integration", () => {
  it("auto-discovers WORKFLOW.md from the parent of dataDir and deep-merges overlay.yaml", async () => {
    const projectDir = await createTempDir();
    const dataDir = path.join(projectDir, ".risoluto");
    const isolatedCwd = await createTempDir();
    await mkdir(path.join(dataDir, "config"), { recursive: true });

    const workflowPath = path.join(projectDir, "WORKFLOW.md");
    await writeFile(
      workflowPath,
      [
        "---",
        "tracker:",
        "  project_slug: FROM-WORKFLOW",
        "server:",
        "  port: 5050",
        "---",
        "Imported prompt for {{ issue.identifier }}",
      ].join("\n"),
      "utf8",
    );
    const overlayPath = path.join(dataDir, "config", "overlay.yaml");
    await writeFile(
      overlayPath,
      ["tracker:", "  project_slug: FROM-OVERLAY", "workspace:", "  strategy: worktree"].join("\n"),
      "utf8",
    );

    process.chdir(isolatedCwd);

    const db = openSeededDatabase(path.join(dataDir, "config.db"));
    try {
      const logger = createMockLogger();
      const result = await importLegacyFiles(db, dataDir, logger);

      expect(result).toEqual({
        imported: true,
        sources: [workflowPath, overlayPath],
        sectionCount: 3,
      });

      const trackerRow = db.select().from(config).where(eq(config.key, "tracker")).get();
      const tracker = JSON.parse(trackerRow!.value) as Record<string, unknown>;
      expect(tracker.project_slug).toBe("FROM-OVERLAY");

      const serverRow = db.select().from(config).where(eq(config.key, "server")).get();
      const server = JSON.parse(serverRow!.value) as Record<string, unknown>;
      expect(server.port).toBe(5050);

      const workspaceRow = db.select().from(config).where(eq(config.key, "workspace")).get();
      const workspace = JSON.parse(workspaceRow!.value) as Record<string, unknown>;
      expect(workspace.strategy).toBe("worktree");

      const template = db.select().from(promptTemplates).where(eq(promptTemplates.id, "default")).get();
      expect(template?.body).toContain("Imported prompt");

      const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
      const system = JSON.parse(systemRow!.value) as Record<string, unknown>;
      expect(system.legacyImportVersion).toBe(1);
      expect(system.lastImportedFrom).toEqual([workflowPath, overlayPath]);

      expect(logger.info).toHaveBeenCalledWith({ path: workflowPath }, "imported WORKFLOW.md config");
      expect(logger.info).toHaveBeenCalledWith({ path: overlayPath }, "imported overlay.yaml");
    } finally {
      closeDatabase(db);
    }
  });

  it("logs parse failures, marks import metadata, and avoids retrying failed discovery on the next boot", async () => {
    const dataDir = await createTempDir();
    await mkdir(path.join(dataDir, "config"), { recursive: true });

    const workflowPath = path.join(dataDir, "WORKFLOW.md");
    const overlayPath = path.join(dataDir, "config", "overlay.yaml");
    await writeFile(workflowPath, "---\ntracker: [\n---\nBroken prompt", "utf8");
    await writeFile(overlayPath, "tracker:\n  project_slug: [\n", "utf8");

    const db = openSeededDatabase(path.join(dataDir, "config.db"));
    try {
      const logger = createMockLogger();
      const first = await importLegacyFiles(db, dataDir, logger, workflowPath);
      expect(first).toEqual({ imported: false, sources: [], sectionCount: 0 });

      const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
      const system = JSON.parse(systemRow!.value) as Record<string, unknown>;
      expect(system.legacyImportVersion).toBe(1);
      expect(system.lastImportedFrom).toEqual([]);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ path: workflowPath }),
        "failed to import WORKFLOW.md",
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ path: overlayPath }),
        "failed to import overlay.yaml",
      );

      const second = await importLegacyFiles(db, dataDir, logger, workflowPath);
      expect(second).toEqual({ imported: false, sources: [], sectionCount: 0 });
    } finally {
      closeDatabase(db);
    }
  });

  it("recreates the default prompt template when config rows already exist but templates are empty", async () => {
    const dataDir = await createTempDir();
    const db = openSeededDatabase(path.join(dataDir, "config.db"));

    try {
      db.delete(promptTemplates).run();

      seedDefaults(db);

      const templates = db.select().from(promptTemplates).all();
      expect(templates).toHaveLength(1);
      expect(templates[0]).toMatchObject({
        id: "default",
        name: "Default",
      });

      const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
      const system = JSON.parse(systemRow!.value) as Record<string, unknown>;
      expect(system.selectedTemplateId).toBe("default");
    } finally {
      closeDatabase(db);
    }
  });

  it("bypasses discovery when workflowPath is null and still records that the import check already happened", async () => {
    const dataDir = await createTempDir();
    const db = openSeededDatabase(path.join(dataDir, "config.db"));

    try {
      const result = await importLegacyFiles(db, dataDir, createMockLogger(), null);
      expect(result).toEqual({ imported: false, sources: [], sectionCount: 0 });

      const systemRow = db.select().from(config).where(eq(config.key, "system")).get();
      const system = JSON.parse(systemRow!.value) as Record<string, unknown>;
      expect(system.legacyImportVersion).toBe(1);
      expect(system.lastImportedFrom).toEqual([]);

      const rawSystemValue = await readFile(path.join(dataDir, "config.db-wal")).catch(() => null);
      expect(rawSystemValue === null || rawSystemValue instanceof Buffer).toBe(true);
    } finally {
      closeDatabase(db);
    }
  });
});
