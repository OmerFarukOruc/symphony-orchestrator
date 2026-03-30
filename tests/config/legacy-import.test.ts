import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { openDatabase, closeDatabase } from "../../src/persistence/sqlite/database.js";
import { config, promptTemplates } from "../../src/persistence/sqlite/schema.js";
import { seedDefaults, importLegacyFiles } from "../../src/config/legacy-import.js";
import { DEFAULT_CONFIG_SECTIONS, DEFAULT_PROMPT_TEMPLATE } from "../../src/config/defaults.js";
import { createLogger } from "../../src/core/logger.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "legacy-import-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("seedDefaults", () => {
  it("seeds all config sections into an empty DB", async () => {
    const dir = await createTempDir();
    const db = openDatabase(path.join(dir, "test.db"));
    try {
      seedDefaults(db);

      const rows = db.select().from(config).all();
      const keys = rows.map((row) => row.key).sort();
      expect(keys).toContain("tracker");
      expect(keys).toContain("codex");
      expect(keys).toContain("workspace");
      expect(keys).toContain("agent");
      expect(keys).toContain("server");
      expect(keys).toContain("system");

      const trackerRow = db.select().from(config).where(eq(config.key, "tracker")).get();
      expect(JSON.parse(trackerRow!.value)).toMatchObject({ kind: "linear" });
    } finally {
      closeDatabase(db);
    }
  });

  it("seeds default prompt template", async () => {
    const dir = await createTempDir();
    const db = openDatabase(path.join(dir, "test.db"));
    try {
      seedDefaults(db);

      const templates = db.select().from(promptTemplates).all();
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe("default");
      expect(templates[0].body).toBe(DEFAULT_PROMPT_TEMPLATE);
    } finally {
      closeDatabase(db);
    }
  });

  it("is idempotent — does not duplicate on second call", async () => {
    const dir = await createTempDir();
    const db = openDatabase(path.join(dir, "test.db"));
    try {
      seedDefaults(db);
      seedDefaults(db);

      const rows = db.select().from(config).all();
      expect(rows.length).toBe(Object.keys(DEFAULT_CONFIG_SECTIONS).length);
    } finally {
      closeDatabase(db);
    }
  });
});

describe("importLegacyFiles", () => {
  it("imports WORKFLOW.md config into DB sections", async () => {
    const dir = await createTempDir();
    const db = openDatabase(path.join(dir, "test.db"));
    try {
      seedDefaults(db);

      const workflowContent = [
        "---",
        "tracker:",
        "  project_slug: MY-PROJECT",
        "server:",
        "  port: 5000",
        "---",
        "Custom prompt template for {{ issue.identifier }}",
      ].join("\n");

      const workflowPath = path.join(dir, "WORKFLOW.md");
      await writeFile(workflowPath, workflowContent, "utf8");

      const result = await importLegacyFiles(db, dir, createLogger(), workflowPath);

      expect(result.imported).toBe(true);
      expect(result.sources).toContain(workflowPath);

      // Tracker should have the imported project_slug
      const trackerRow = db.select().from(config).where(eq(config.key, "tracker")).get();
      const tracker = JSON.parse(trackerRow!.value) as Record<string, unknown>;
      expect(tracker.project_slug).toBe("MY-PROJECT");

      // Server should have port 5000
      const serverRow = db.select().from(config).where(eq(config.key, "server")).get();
      const server = JSON.parse(serverRow!.value) as Record<string, unknown>;
      expect(server.port).toBe(5000);

      // Prompt template should be updated
      const template = db.select().from(promptTemplates).where(eq(promptTemplates.id, "default")).get();
      expect(template!.body).toContain("Custom prompt template");
    } finally {
      closeDatabase(db);
    }
  });

  it("deep-merges overlay.yaml on top of WORKFLOW.md", async () => {
    const dir = await createTempDir();
    const db = openDatabase(path.join(dir, "test.db"));
    try {
      seedDefaults(db);

      const workflowContent = ["---", "tracker:", "  project_slug: FROM-WORKFLOW", "---", "template body"].join("\n");
      const workflowPath = path.join(dir, "WORKFLOW.md");
      await writeFile(workflowPath, workflowContent, "utf8");

      const overlayContent = "tracker:\n  project_slug: FROM-OVERLAY\n";
      await mkdir(path.join(dir, "config"), { recursive: true });
      await writeFile(path.join(dir, "config", "overlay.yaml"), overlayContent, "utf8");

      await importLegacyFiles(db, dir, createLogger(), workflowPath);

      const trackerRow = db.select().from(config).where(eq(config.key, "tracker")).get();
      const tracker = JSON.parse(trackerRow!.value) as Record<string, unknown>;
      // Overlay should win over WORKFLOW.md
      expect(tracker.project_slug).toBe("FROM-OVERLAY");
    } finally {
      closeDatabase(db);
    }
  });

  it("records legacyImportVersion and never re-imports", async () => {
    const dir = await createTempDir();
    const db = openDatabase(path.join(dir, "test.db"));
    try {
      seedDefaults(db);

      const workflowPath = path.join(dir, "WORKFLOW.md");
      await writeFile(workflowPath, "---\nserver:\n  port: 9999\n---\ntemplate", "utf8");

      const first = await importLegacyFiles(db, dir, createLogger(), workflowPath);
      expect(first.imported).toBe(true);

      // Second call should be a no-op
      const second = await importLegacyFiles(db, dir, createLogger(), workflowPath);
      expect(second.imported).toBe(false);
    } finally {
      closeDatabase(db);
    }
  });

  it("returns not-imported when no legacy files exist", async () => {
    const dir = await createTempDir();
    const db = openDatabase(path.join(dir, "test.db"));
    try {
      seedDefaults(db);

      // Pass null to bypass process.cwd() discovery — the temp dir has no WORKFLOW files
      const result = await importLegacyFiles(db, dir, createLogger(), null);
      expect(result.imported).toBe(false);
    } finally {
      closeDatabase(db);
    }
  });
});
