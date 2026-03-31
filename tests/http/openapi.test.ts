import { describe, expect, it } from "vitest";

import { getOpenApiSpec } from "../../src/http/openapi.js";
import { getSwaggerHtml } from "../../src/http/swagger-html.js";

describe("getOpenApiSpec", () => {
  const spec = getOpenApiSpec();

  it("returns a valid OpenAPI 3.1 document", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec).toHaveProperty("info");
    expect(spec).toHaveProperty("paths");
  });

  it("includes server info", () => {
    const servers = spec.servers as Array<{ url: string; description: string }>;
    expect(servers).toHaveLength(1);
    expect(servers[0].url).toBe("http://localhost:4000");
  });

  it("includes core state routes", () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths).toHaveProperty("/api/v1/state");
    expect(paths).toHaveProperty("/api/v1/runtime");
    expect(paths).toHaveProperty("/api/v1/refresh");
    expect(paths).toHaveProperty("/metrics");
  });

  it("includes issue routes with path parameters", () => {
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    expect(paths).toHaveProperty("/api/v1/{issue_identifier}");
    expect(paths).toHaveProperty("/api/v1/{issue_identifier}/abort");
    expect(paths).toHaveProperty("/api/v1/{issue_identifier}/model");
    expect(paths).toHaveProperty("/api/v1/{issue_identifier}/transition");
    expect(paths).toHaveProperty("/api/v1/{issue_identifier}/attempts");
    expect(paths).toHaveProperty("/api/v1/attempts/{attempt_id}");
  });

  it("includes workspace, git, config, and secrets routes", () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths).toHaveProperty("/api/v1/workspaces");
    expect(paths).toHaveProperty("/api/v1/workspaces/{workspace_key}");
    expect(paths).toHaveProperty("/api/v1/git/context");
    expect(paths).toHaveProperty("/api/v1/config");
    expect(paths).toHaveProperty("/api/v1/config/overlay");
    expect(paths).toHaveProperty("/api/v1/secrets");
    expect(paths).toHaveProperty("/api/v1/secrets/{key}");
  });

  it("references request body schemas on POST endpoints", () => {
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    const modelPost = paths["/api/v1/{issue_identifier}/model"].post;
    expect(modelPost).toHaveProperty("requestBody");

    const transitionPost = paths["/api/v1/{issue_identifier}/transition"].post;
    expect(transitionPost).toHaveProperty("requestBody");
  });

  it("groups routes by tags", () => {
    const paths = spec.paths as Record<string, Record<string, Record<string, string[]>>>;
    expect(paths["/api/v1/state"].get.tags).toContain("State & Metrics");
    expect(paths["/api/v1/{issue_identifier}/abort"].post.tags).toContain("Issues");
    expect(paths["/api/v1/{issue_identifier}/attempts"].get.tags).toContain("Attempts");
    expect(paths["/api/v1/workspaces"].get.tags).toContain("Workspaces");
    expect(paths["/api/v1/git/context"].get.tags).toContain("Git");
    expect(paths["/api/v1/config"].get.tags).toContain("Config");
    expect(paths["/api/v1/secrets"].get.tags).toContain("Secrets");
  });

  it("produces JSON-serializable output", () => {
    const serialized = JSON.stringify(spec);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});

describe("getSwaggerHtml", () => {
  const html = getSwaggerHtml();

  it("returns an HTML document", () => {
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("loads Swagger UI from CDN", () => {
    expect(html).toContain("swagger-ui-bundle.js");
    expect(html).toContain("swagger-ui.css");
    expect(html).toContain("unpkg.com/swagger-ui-dist");
  });

  it("points to the openapi.json endpoint", () => {
    expect(html).toContain("/api/v1/openapi.json");
  });
});
