import { describe, expect, it } from "vitest";

import {
  buildSettingsSections,
  getSectionGroup,
  SECTION_GROUPS,
  sectionGroups,
} from "../../frontend/src/features/settings/settings-helpers";

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

  it("marks expert-tier settings for progressive disclosure", () => {
    const sections = buildSettingsSections(null, {});
    const tracker = sections.find((section) => section.id === "tracker");
    const provider = sections.find((section) => section.id === "model-provider-auth");
    const sandbox = sections.find((section) => section.id === "sandbox");

    expect(tracker?.fields.find((field) => field.path === "tracker.endpoint")?.tier).toBe("expert");
    expect(provider?.fields.find((field) => field.path === "codex.provider.base_url")?.tier).toBe("expert");
    expect(sandbox?.fields.find((field) => field.path === "codex.sandbox.resources.memory")?.tier).toBe("expert");
  });

  it("includes a credentials section", () => {
    const sections = buildSettingsSections(null, {});
    const cred = sections.find((s) => s.id === "credentials");
    expect(cred).toMatchObject({ id: "credentials" });
    expect(cred!.fields[0].kind).toBe("credential");
  });

  it("section descriptions avoid jargon", () => {
    const JARGON = ["surfaced", "shaped views", "safety posture"];
    const sections = buildSettingsSections(null, {});
    for (const section of sections) {
      for (const word of JARGON) {
        expect(section.description.toLowerCase()).not.toContain(word);
      }
    }
  });
});

describe("sectionGroups", () => {
  it("groups tracker settings into connection, workflow, and advanced connection buckets", () => {
    const sections = buildSettingsSections(null, {});
    const tracker = sections.find((section) => section.id === "tracker");

    expect(tracker).toMatchObject({ id: "tracker" });
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

    expect(provider).toMatchObject({ id: "model-provider-auth" });
    const groups = sectionGroups(provider!);

    expect(groups.map((group) => ({ title: group.title, advanced: group.advanced }))).toEqual([
      { title: "Default model", advanced: false },
      { title: "Sign-in", advanced: false },
      { title: "Sign-in", advanced: true },
      { title: "Provider routing", advanced: true },
    ]);
  });
});

describe("SECTION_GROUPS", () => {
  it("has 4 entries with valid id, label, and icon fields", () => {
    const groups = Object.values(SECTION_GROUPS);
    expect(groups).toHaveLength(4);
    for (const group of groups) {
      expect(group.id).toBeTruthy();
      expect(group.label).toBeTruthy();
      expect(group.icon).toBeTruthy();
    }
  });
});

describe("getSectionGroup", () => {
  it("returns SETUP for tracker", () => {
    expect(getSectionGroup("tracker")).toEqual(SECTION_GROUPS.SETUP);
  });

  it("returns AGENT for sandbox", () => {
    expect(getSectionGroup("sandbox")).toEqual(SECTION_GROUPS.AGENT);
  });

  it("returns undefined for unknown section id", () => {
    expect(getSectionGroup("unknown")).toBeUndefined();
  });

  it("assigns a valid groupId to every default section", () => {
    const validGroupIds = new Set(Object.values(SECTION_GROUPS).map((g) => g.id));
    const sections = buildSettingsSections(null, {});
    for (const section of sections) {
      expect(section.groupId).toBeDefined();
      expect(validGroupIds.has(section.groupId!)).toBe(true);
    }
  });
});
