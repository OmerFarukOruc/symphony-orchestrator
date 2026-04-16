/**
 * Prompt template store backed by the SQLite `prompt_templates` table.
 *
 * Provides CRUD operations for Liquid prompt templates used by the
 * agent runner. The active template is resolved via
 * `config.system.selectedTemplateId` in DbConfigStore.
 */

import { eq } from "drizzle-orm";

import type { RisolutoDatabase } from "../persistence/sqlite/database.js";
import { config, promptTemplates } from "../persistence/sqlite/schema.js";
import type { RisolutoLogger } from "../core/types.js";
import { createPromptLiquid, PromptTemplateValidationError, validatePromptTemplate } from "./template-policy.js";
import type { TemplateStorePort } from "./port.js";
import type { PromptTemplate, PreviewResult } from "./types.js";

export type { PromptTemplate, PreviewResult };

function buildSampleContext() {
  const now = new Date().toISOString();
  return {
    issue: {
      id: "sample-id",
      identifier: "PROJ-42",
      title: "Example issue for template preview",
      description: "This is sample issue description text used to preview the prompt template.",
      priority: 2,
      state: "In Progress",
      branchName: "feature/proj-42-example",
      url: "https://linear.app/example/issue/PROJ-42",
      labels: ["bug", "high-priority"],
      blockedBy: [],
      createdAt: now,
      updatedAt: now,
    },
    workspace: { path: "/home/user/workspaces/PROJ-42", workspaceKey: "PROJ-42" },
    attempt: 1,
  };
}

function assertValidTemplateBody(body: string): void {
  validatePromptTemplate(body);
}

export class PromptTemplateStore implements TemplateStorePort {
  private readonly liquid = createPromptLiquid();

  constructor(
    private readonly db: RisolutoDatabase,
    private readonly logger: RisolutoLogger,
  ) {}

  list(): PromptTemplate[] {
    return this.db.select().from(promptTemplates).all().map(rowToTemplate);
  }

  get(id: string): PromptTemplate | null {
    const row = this.db.select().from(promptTemplates).where(eq(promptTemplates.id, id)).get();
    return row ? rowToTemplate(row) : null;
  }

  create(template: Omit<PromptTemplate, "createdAt" | "updatedAt">): PromptTemplate {
    assertValidTemplateBody(template.body);

    const now = new Date().toISOString();
    this.db
      .insert(promptTemplates)
      .values({
        id: template.id,
        name: template.name,
        body: template.body,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    this.logger.info({ templateId: template.id }, "prompt template created");
    return { ...template, createdAt: now, updatedAt: now };
  }

  update(id: string, patch: Partial<Pick<PromptTemplate, "name" | "body">>): PromptTemplate | null {
    const existing = this.get(id);
    if (!existing) return null;

    if (patch.body !== undefined) {
      assertValidTemplateBody(patch.body);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.body !== undefined) updates.body = patch.body;

    this.db.update(promptTemplates).set(updates).where(eq(promptTemplates.id, id)).run();
    this.logger.info({ templateId: id }, "prompt template updated");

    return {
      ...existing,
      name: patch.name ?? existing.name,
      body: patch.body ?? existing.body,
      updatedAt: now,
    };
  }

  remove(id: string): { deleted: boolean; error?: string } {
    const existing = this.get(id);
    if (!existing) return { deleted: false };

    // Guard: prevent deleting the currently active template.
    const systemRow = this.db.select().from(config).where(eq(config.key, "system")).get();
    if (systemRow) {
      const system = JSON.parse(systemRow.value) as Record<string, unknown>;
      if (system.selectedTemplateId === id) {
        return {
          deleted: false,
          error: `cannot delete the active template "${id}" — select a different template first`,
        };
      }
    }

    this.db.delete(promptTemplates).where(eq(promptTemplates.id, id)).run();
    this.logger.info({ templateId: id }, "prompt template deleted");
    return { deleted: true };
  }

  async preview(id: string): Promise<PreviewResult> {
    const template = this.get(id);
    if (!template) {
      return { rendered: "", error: `template "${id}" not found` };
    }
    return this.renderPreview(template.body);
  }

  async renderPreview(body: string): Promise<PreviewResult> {
    try {
      assertValidTemplateBody(body);
      const parsed = this.liquid.parse(body);
      const rendered = await this.liquid.render(parsed, buildSampleContext());
      return { rendered, error: null };
    } catch (error) {
      const message = error instanceof PromptTemplateValidationError ? error.message : String(error);
      return { rendered: "", error: message };
    }
  }
}

function rowToTemplate(row: {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
