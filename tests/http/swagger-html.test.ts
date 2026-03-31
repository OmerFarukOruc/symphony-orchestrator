import { describe, expect, it } from "vitest";

import { getSwaggerHtml } from "../../src/http/swagger-html.js";

describe("getSwaggerHtml", () => {
  it("returns a valid HTML string", () => {
    const html = getSwaggerHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("contains Swagger UI CDN references", () => {
    const html = getSwaggerHtml();
    expect(html).toContain("swagger-ui-dist@5");
    expect(html).toContain("swagger-ui.css");
    expect(html).toContain("swagger-ui-bundle.js");
  });

  it("configures Swagger UI to load the openapi.json endpoint", () => {
    const html = getSwaggerHtml();
    expect(html).toContain("/api/v1/openapi.json");
    expect(html).toContain("#swagger-ui");
  });

  it("includes page metadata", () => {
    const html = getSwaggerHtml();
    expect(html).toContain('charset="UTF-8"');
    expect(html).toContain("Risoluto API Docs");
  });

  it("returns the same cached reference on subsequent calls", () => {
    const first = getSwaggerHtml();
    const second = getSwaggerHtml();
    // Module-level cache means identical object reference
    expect(first).toBe(second);
  });
});
