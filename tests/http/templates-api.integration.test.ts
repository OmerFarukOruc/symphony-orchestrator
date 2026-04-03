/**
 * Integration tests for the prompt template CRUD + preview API.
 *
 * Uses a real SQLite database (temp file) and a real PromptTemplateStore
 * wired into the HttpServer via the test harness.
 *
 * Endpoints covered:
 *   GET    /api/v1/templates
 *   POST   /api/v1/templates
 *   GET    /api/v1/templates/:id
 *   PUT    /api/v1/templates/:id
 *   DELETE /api/v1/templates/:id
 *   POST   /api/v1/templates/:id/preview
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase, type RisolutoDatabase } from "../../src/persistence/sqlite/database.js";
import { PromptTemplateStore } from "../../src/prompt/store.js";
import { buildSilentLogger, startTestServer, type TestServerResult } from "../helpers/http-server-harness.js";

/* ------------------------------------------------------------------ */
/*  Per-test setup                                                      */
/* ------------------------------------------------------------------ */

let ctx: TestServerResult;
let db: RisolutoDatabase;
let templateStore: PromptTemplateStore;
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "risoluto-templates-integ-"));
  db = openDatabase(path.join(tempDir, "templates.db"));
  templateStore = new PromptTemplateStore(db, buildSilentLogger());
  ctx = await startTestServer({ templateStore });
});

afterEach(async () => {
  await ctx.teardown();
  closeDatabase(db);
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const VALID_BODY = "You are working on: {{issue.title}}";

async function fetchTemplates(): Promise<Response> {
  return fetch(`${ctx.baseUrl}/api/v1/templates`);
}

async function createTemplate(payload: Record<string, unknown>): Promise<Response> {
  return fetch(`${ctx.baseUrl}/api/v1/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function getTemplate(id: string): Promise<Response> {
  return fetch(`${ctx.baseUrl}/api/v1/templates/${id}`);
}

async function updateTemplate(id: string, patch: Record<string, unknown>): Promise<Response> {
  return fetch(`${ctx.baseUrl}/api/v1/templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

async function deleteTemplate(id: string): Promise<Response> {
  return fetch(`${ctx.baseUrl}/api/v1/templates/${id}`, { method: "DELETE" });
}

async function previewTemplate(id: string): Promise<Response> {
  return fetch(`${ctx.baseUrl}/api/v1/templates/${id}/preview`, { method: "POST" });
}

/* ------------------------------------------------------------------ */
/*  Collection endpoint                                                 */
/* ------------------------------------------------------------------ */

describe("GET /api/v1/templates", () => {
  it("returns an empty list initially", async () => {
    const response = await fetchTemplates();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ templates: [] });
  });

  it("lists templates after creation", async () => {
    await createTemplate({ id: "t1", name: "Template One", body: VALID_BODY });
    await createTemplate({ id: "t2", name: "Template Two", body: VALID_BODY });

    const response = await fetchTemplates();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { templates: unknown[] };
    expect(body.templates).toHaveLength(2);
  });
});

describe("POST /api/v1/templates", () => {
  it("creates a template and returns 201 with { template }", async () => {
    const response = await createTemplate({ id: "my-tpl", name: "My Template", body: VALID_BODY });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { template: Record<string, unknown> };
    expect(body.template.id).toBe("my-tpl");
    expect(body.template.name).toBe("My Template");
    expect(body.template.body).toBe(VALID_BODY);
    expect(typeof body.template.createdAt).toBe("string");
    expect(typeof body.template.updatedAt).toBe("string");
  });

  it("returns 409 when template id already exists", async () => {
    await createTemplate({ id: "dup", name: "First", body: VALID_BODY });
    const response = await createTemplate({ id: "dup", name: "Second", body: VALID_BODY });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(body.error.code).toBe("template_exists");
  });

  it("returns 400 when id is missing", async () => {
    const response = await createTemplate({ name: "No ID", body: VALID_BODY });
    expect(response.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    const response = await createTemplate({ id: "no-name", body: VALID_BODY });
    expect(response.status).toBe(400);
  });

  it("returns 400 when body is missing", async () => {
    const response = await createTemplate({ id: "no-body", name: "No Body" });
    expect(response.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/*  Individual template routes                                          */
/* ------------------------------------------------------------------ */

describe("GET /api/v1/templates/:id", () => {
  it("returns the template by id", async () => {
    await createTemplate({ id: "get-me", name: "Get Me", body: VALID_BODY });

    const response = await getTemplate("get-me");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { template: Record<string, unknown> };
    expect(body.template.id).toBe("get-me");
  });

  it("returns 404 for an unknown id", async () => {
    const response = await getTemplate("does-not-exist");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(body.error.code).toBe("template_not_found");
  });
});

describe("PUT /api/v1/templates/:id", () => {
  it("updates name and body, returns the updated template", async () => {
    await createTemplate({ id: "upd", name: "Original", body: VALID_BODY });

    const newBody = "Issue: {{issue.identifier}}";
    const response = await updateTemplate("upd", { name: "Updated", body: newBody });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { template: Record<string, unknown> };
    expect(body.template.name).toBe("Updated");
    expect(body.template.body).toBe(newBody);
  });

  it("returns 404 for an unknown id", async () => {
    const response = await updateTemplate("ghost", { name: "x" });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(body.error.code).toBe("template_not_found");
  });

  it("returns 400 when body is not a JSON object (sends array)", async () => {
    await createTemplate({ id: "obj-check", name: "Check", body: VALID_BODY });
    const response = await fetch(`${ctx.baseUrl}/api/v1/templates/obj-check`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["not", "an", "object"]),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(body.error.code).toBe("invalid_payload");
  });
});

describe("DELETE /api/v1/templates/:id", () => {
  it("deletes the template and returns { deleted: true }", async () => {
    await createTemplate({ id: "del-me", name: "Delete Me", body: VALID_BODY });

    const response = await deleteTemplate("del-me");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ deleted: true });

    // Confirm it is gone
    const getResponse = await getTemplate("del-me");
    expect(getResponse.status).toBe(404);
  });

  it("returns 404 for an unknown id", async () => {
    const response = await deleteTemplate("ghost");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(body.error.code).toBe("template_not_found");
  });
});

describe("POST /api/v1/templates/:id/preview", () => {
  it("renders the template with sample context and returns { rendered, error: null }", async () => {
    await createTemplate({ id: "preview-me", name: "Preview", body: VALID_BODY });

    const response = await previewTemplate("preview-me");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { rendered: string; error: unknown };
    expect(body.error).toBeNull();
    expect(body.rendered).toContain("Example issue for template preview");
  });

  it("returns 400 with error message when template does not exist", async () => {
    const response = await previewTemplate("no-such-template");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { rendered: string; error: string };
    expect(body.error).toContain("no-such-template");
  });
});

/* ------------------------------------------------------------------ */
/*  Method guards                                                       */
/* ------------------------------------------------------------------ */

describe("/api/v1/templates — method guards", () => {
  it("PUT on collection → 405", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/templates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(405);
  });

  it("DELETE on collection → 405", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/templates`, { method: "DELETE" });
    expect(response.status).toBe(405);
  });
});

describe("/api/v1/templates/:id — method guards", () => {
  beforeEach(async () => {
    await createTemplate({ id: "guard-tpl", name: "Guard", body: VALID_BODY });
  });

  it("POST on single resource → 405", async () => {
    const response = await fetch(`${ctx.baseUrl}/api/v1/templates/guard-tpl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(405);
  });
});
