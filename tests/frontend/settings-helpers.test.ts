import { describe, expect, it } from "vitest";

import { buildSettingsSections, sectionGroups } from "../../frontend/src/views/settings-helpers";

describe("buildSettingsSections", () => {
  it("uses clearer tracker labels and hints in the default schema-limited view", () => {
    const sections = buildSettingsSections(null, {});
    const tracker = sections.find((section) => section.id === "tracker");

    expect(tracker?.description).toContain("issue tracker");
    expect(tracker?.fields.map((field) => field.label)).toEqual([
      "Issue tracker",
      "Endpoint override",
      "Linear project",
      "States that mean work is active",
      "States that mean work is done",
    ]);
    expect(tracker?.fields[3]?.placeholder).toBe("Todo\nIn Progress");
    expect(tracker?.fields[4]?.placeholder).toBe("Done\nCanceled");
  });

  it("marks advanced settings groups for progressive disclosure", () => {
    const sections = buildSettingsSections(null, {});
    const tracker = sections.find((section) => section.id === "tracker");
    const provider = sections.find((section) => section.id === "model-provider-auth");
    const sandbox = sections.find((section) => section.id === "sandbox");

    expect(tracker?.fields.find((field) => field.path === "tracker.endpoint")?.advanced).toBe(true);
    expect(provider?.fields.find((field) => field.path === "codex.provider.base_url")?.advanced).toBe(true);
    expect(sandbox?.fields.find((field) => field.path === "codex.sandbox.resources.memory")?.advanced).toBe(true);
  });
});

describe("sectionGroups", () => {
  it("groups tracker settings into connection, workflow, and advanced connection buckets", () => {
    const sections = buildSettingsSections(null, {});
    const tracker = sections.find((section) => section.id === "tracker");

    expect(tracker).toBeDefined();
    const groups = sectionGroups(tracker!);

    expect(groups.map((group) => ({ title: group.title, advanced: group.advanced }))).toEqual([
      { title: "Connection", advanced: false },
      { title: "Advanced connection", advanced: true },
      { title: "Workflow meaning", advanced: false },
    ]);
    expect(groups[0]?.fields.map((field) => field.path)).toEqual(["tracker.kind", "tracker.project_slug"]);
    expect(groups[2]?.fields.map((field) => field.path)).toEqual(["tracker.active_states", "tracker.terminal_states"]);
  });

  it("keeps provider routing collapsed while core model/auth groups stay open", () => {
    const sections = buildSettingsSections(null, {});
    const provider = sections.find((section) => section.id === "model-provider-auth");

    expect(provider).toBeDefined();
    const groups = sectionGroups(provider!);

    expect(groups.map((group) => ({ title: group.title, advanced: group.advanced }))).toEqual([
      { title: "Default model", advanced: false },
      { title: "Authentication", advanced: false },
      { title: "Authentication", advanced: true },
      { title: "Provider routing", advanced: true },
    ]);
  });
});
