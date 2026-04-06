import { describe, expect, it } from "vitest";

import type { AsyncState } from "../../frontend/src/utils/async-state";
import type { SettingsState } from "../../frontend/src/features/settings/settings-state";
import { type SettingsPageData, updateSettingsHeader } from "../../frontend/src/features/settings/settings-view-render";

function createStubElement(): HTMLElement {
  return { textContent: "" } as unknown as HTMLElement;
}

function createSettingsState(): SettingsState {
  return {
    effective: {},
    overlay: {},
    schema: null,
    savingSectionId: null,
    error: null,
    filter: "",
    selectedSectionId: "tracker",
    drafts: {},
    expandedDiffs: new Set<string>(),
    expandedPaths: new Set<string>(),
    openExperts: new Set<string>(),
    mode: "simple",
  };
}

function createLoadState(
  data: SettingsPageData | null,
  loading = false,
  error: string | null = null,
): AsyncState<SettingsPageData> {
  return { loading, error, data };
}

describe("updateSettingsHeader", () => {
  it("describes the loading state with clearer copy", () => {
    const subtitle = createStubElement();
    const badge = createStubElement();

    updateSettingsHeader(subtitle, badge, createSettingsState(), createLoadState(null, true));

    expect(subtitle.textContent).toBe("Loading tracker, provider, sandbox, and runtime settings.");
    expect(badge.textContent).toBe("Loading…");
  });

  it("uses guided-schema wording when the schema is limited", () => {
    const subtitle = createStubElement();
    const badge = createStubElement();

    updateSettingsHeader(
      subtitle,
      badge,
      createSettingsState(),
      createLoadState({ effective: {}, overlay: {}, schema: null }),
    );

    expect(subtitle.textContent).toContain("guided defaults");
    expect(badge.textContent).toBe("Guided schema");
  });

  it("uses full-schema wording when schema sections are available", () => {
    const subtitle = createStubElement();
    const badge = createStubElement();

    updateSettingsHeader(
      subtitle,
      badge,
      createSettingsState(),
      createLoadState({
        effective: {},
        overlay: {},
        schema: {
          sections: [
            {
              id: "tracker",
              title: "Tracker",
              description: "Tracker settings",
              badge: "Setup",
              saveLabel: "Save tracker",
              fields: [{ path: "tracker.kind", label: "Tracker kind", kind: "text" }],
            },
          ],
        },
      }),
    );

    expect(subtitle.textContent).toContain("full schema");
    expect(badge.textContent).toBe("Full schema");
  });

  it("keeps error and empty states direct", () => {
    const subtitle = createStubElement();
    const badge = createStubElement();

    updateSettingsHeader(subtitle, badge, createSettingsState(), createLoadState(null, false, "Network down"));
    expect(subtitle.textContent).toBe("Settings could not be loaded. Check the API or network, then try again.");
    expect(badge.textContent).toBe("Unavailable");

    updateSettingsHeader(subtitle, badge, createSettingsState(), createLoadState(null));
    expect(subtitle.textContent).toBe("Settings are not available yet.");
    expect(badge.textContent).toBe("No data");
  });
});
