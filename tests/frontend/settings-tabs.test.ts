import { describe, expect, it } from "vitest";

import {
  normalizeLegacySettingsPath,
  parseSettingsSectionHash,
  settingsPathForSection,
} from "../../frontend/src/utils/settings-tabs";

describe("settings-tabs", () => {
  it("parses known section hashes and returns null for unknown", () => {
    expect(parseSettingsSectionHash("#credentials")).toBe("credentials");
    expect(parseSettingsSectionHash("#devtools")).toBe("devtools");
    expect(parseSettingsSectionHash("#unknown")).toBeNull();
    expect(parseSettingsSectionHash("#general")).toBeNull();
    expect(parseSettingsSectionHash("")).toBeNull();
  });

  it("maps sections to settings URLs", () => {
    expect(settingsPathForSection(null)).toBe("/settings");
    expect(settingsPathForSection("credentials")).toBe("/settings#credentials");
    expect(settingsPathForSection("devtools")).toBe("/settings#devtools");
  });

  it("normalizes legacy config and secrets paths", () => {
    expect(normalizeLegacySettingsPath("/config")).toBe("devtools");
    expect(normalizeLegacySettingsPath("/secrets")).toBe("credentials");
    expect(normalizeLegacySettingsPath("/settings")).toBeNull();
  });
});
