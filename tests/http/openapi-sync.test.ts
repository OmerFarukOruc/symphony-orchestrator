import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getOpenApiSpec } from "../../src/http/openapi.js";

/**
 * OpenAPI spec sync test (R1).
 *
 * Verifies the runtime-generated OpenAPI spec matches the checked-in
 * `docs-site/openapi.json` exactly. This prevents silent spec drift —
 * any change to route definitions or response schemas in source must be
 * accompanied by a regenerated spec file.
 */
describe("OpenAPI spec sync", () => {
  const checkedInPath = path.resolve(import.meta.dirname, "../../docs-site/openapi.json");
  const checkedInSpec: Record<string, unknown> = JSON.parse(fs.readFileSync(checkedInPath, "utf-8"));

  /** Round-trip the runtime spec through JSON to normalize it (drops undefined, matches file representation). */
  const runtimeSpec: Record<string, unknown> = JSON.parse(JSON.stringify(getOpenApiSpec()));

  it("runtime spec matches checked-in docs-site/openapi.json", () => {
    expect(runtimeSpec).toEqual(checkedInSpec);
  });

  it("spec info.version stays consistent between runtime and checked-in file", () => {
    const runtimeInfo = runtimeSpec.info as Record<string, unknown>;
    const checkedInInfo = checkedInSpec.info as Record<string, unknown>;
    expect(runtimeInfo.version).toBe(checkedInInfo.version);
  });

  it("spec path count stays consistent between runtime and checked-in file", () => {
    const runtimePaths = Object.keys(runtimeSpec.paths as Record<string, unknown>);
    const checkedInPaths = Object.keys(checkedInSpec.paths as Record<string, unknown>);
    expect(runtimePaths).toEqual(checkedInPaths);
  });
});
