/**
 * TemplateStorePort — minimal interface for prompt template persistence.
 *
 * Consumers depend on this interface rather than the concrete PromptTemplateStore
 * so that test doubles can be injected without pulling in the SQLite
 * and Liquid rendering implementation.
 */

import type { PromptTemplate, PreviewResult } from "./types.js";

export interface TemplateStorePort {
  /** Return all stored prompt templates. */
  list(): PromptTemplate[];

  /** Retrieve a template by id, or null if not found. */
  get(id: string): PromptTemplate | null;

  /** Create a new prompt template. Throws if the body is invalid. */
  create(template: Omit<PromptTemplate, "createdAt" | "updatedAt">): PromptTemplate;

  /** Update name and/or body of an existing template. Returns null if not found. */
  update(id: string, patch: Partial<Pick<PromptTemplate, "name" | "body">>): PromptTemplate | null;

  /** Delete a template. Returns an error string if the template is currently active. */
  remove(id: string): { deleted: boolean; error?: string };

  /** Render a preview of the stored template with sample context. */
  preview(id: string): Promise<PreviewResult>;

  /** Render a preview of an arbitrary template body with sample context. */
  renderPreview(body: string): Promise<PreviewResult>;
}
