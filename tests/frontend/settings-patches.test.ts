import { describe, expect, it } from "vitest";

import type { SettingsSectionDefinition } from "../../frontend/src/views/settings-helpers";
import { buildSectionPatchPlan } from "../../frontend/src/views/settings-patches";

const section: SettingsSectionDefinition = {
  id: "runtime",
  title: "Runtime",
  description: "Runtime settings",
  badge: "Core",
  saveLabel: "Save runtime settings",
  prefixes: ["codex", "server"],
  fields: [
    { path: "server.port", label: "Server port", kind: "number" },
    { path: "codex.model", label: "Model", kind: "text" },
  ],
};

describe("buildSectionPatchPlan", () => {
  it("rejects invalid numeric drafts instead of coercing them to zero", () => {
    const plan = buildSectionPatchPlan(
      section,
      { "server.port": "", "codex.model": "gpt-5.4" },
      { server: { port: 4000 }, codex: { model: "gpt-5.3" } },
    );

    expect(plan.errors).toEqual([{ path: "server.port", message: "Server port must be a valid number." }]);
    expect(plan.entries).toEqual([{ path: "codex.model", value: "gpt-5.4" }]);
  });

  it("builds one nested patch object for section saves", () => {
    const plan = buildSectionPatchPlan(
      section,
      { "server.port": "4100", "codex.model": "gpt-5.4" },
      { server: { port: 4000 }, codex: { model: "gpt-5.3" } },
    );

    expect(plan.errors).toEqual([]);
    expect(plan.entries).toEqual([
      { path: "server.port", value: 4100 },
      { path: "codex.model", value: "gpt-5.4" },
    ]);
    expect(plan.patch).toEqual({
      server: { port: 4100 },
      codex: { model: "gpt-5.4" },
    });
  });
});
