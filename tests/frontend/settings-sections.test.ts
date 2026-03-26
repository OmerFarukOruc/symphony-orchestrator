import { describe, expect, it } from "vitest";

import {
  buildSettingsSections,
  SECTION_IDS,
  type SettingsSectionDefinition,
} from "../../frontend/src/views/settings-helpers";

/**
 * Exercises the default section builder (schema-limited path)
 * by passing `null` schema so `buildDefaultSections` is used internally.
 */
function getDefaultSections(): SettingsSectionDefinition[] {
  return buildSettingsSections(null, {});
}

describe("settings-sections", () => {
  describe("section structure from default builder", () => {
    it("returns at least 9 sections with valid IDs", () => {
      const sections = getDefaultSections();
      expect(sections.length).toBeGreaterThanOrEqual(9);

      const ids = sections.map((section) => section.id);
      expect(ids).toContain(SECTION_IDS.TRACKER);
      expect(ids).toContain(SECTION_IDS.MODEL_PROVIDER_AUTH);
      expect(ids).toContain(SECTION_IDS.SANDBOX);
      expect(ids).toContain(SECTION_IDS.AGENT);
      expect(ids).toContain(SECTION_IDS.REPOSITORIES_GITHUB);
      expect(ids).toContain(SECTION_IDS.NOTIFICATIONS);
      expect(ids).toContain(SECTION_IDS.WORKFLOW_STAGES);
      expect(ids).toContain(SECTION_IDS.FEATURE_FLAGS);
      expect(ids).toContain(SECTION_IDS.RUNTIME_PATHS);
    });

    it("each section has required fields", () => {
      const sections = getDefaultSections();
      for (const section of sections) {
        expect(section.id).toBeTruthy();
        expect(section.title).toBeTruthy();
        expect(section.description).toBeTruthy();
        expect(section.badge).toBeTruthy();
        expect(section.saveLabel).toBeTruthy();
        expect(Array.isArray(section.fields)).toBe(true);
        expect(Array.isArray(section.prefixes)).toBe(true);
      }
    });

    it("section IDs are unique", () => {
      const sections = getDefaultSections();
      const ids = sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every field has a non-empty path and label", () => {
      const sections = getDefaultSections();
      for (const section of sections) {
        for (const field of section.fields) {
          expect(field.path, `field in section "${section.id}" missing path`).toBeTruthy();
          expect(field.label, `field in section "${section.id}" missing label`).toBeTruthy();
        }
      }
    });
  });

  describe("buildSettingsSections with schema", () => {
    it("returns default sections when schema is null", () => {
      const sections = buildSettingsSections(null, {});
      expect(sections.length).toBeGreaterThanOrEqual(9);
    });

    it("returns default sections when schema has no sections array", () => {
      const sections = buildSettingsSections({}, {});
      expect(sections.length).toBeGreaterThanOrEqual(9);
    });

    it("returns schema-driven sections when schema has a valid sections array", () => {
      const schema = {
        sections: [
          {
            id: "custom",
            title: "Custom",
            description: "Custom section",
            badge: "custom",
            saveLabel: "Save custom",
            fields: [{ path: "custom.key", label: "Custom Key", kind: "text" }],
          },
        ],
      };
      const sections = buildSettingsSections(schema as Record<string, unknown>, {});
      expect(sections).toHaveLength(1);
      expect(sections[0]?.id).toBe("custom");
    });
  });

  describe("section descriptions quality", () => {
    it("every section has a non-empty description", () => {
      const sections = getDefaultSections();
      for (const section of sections) {
        expect(section.description.length, `Section "${section.id}" has empty description`).toBeGreaterThan(0);
      }
    });

    it("descriptions are concise (under 120 characters)", () => {
      const sections = getDefaultSections();
      for (const section of sections) {
        expect(
          section.description.length,
          `Section "${section.id}" description is ${String(section.description.length)} chars`,
        ).toBeLessThanOrEqual(120);
      }
    });
  });
});
