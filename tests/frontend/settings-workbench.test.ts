import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSettingsWorkbench } from "../../frontend/src/features/settings/settings-workbench";

interface FakeSettingsApi {
  getConfig: ReturnType<typeof vi.fn>;
  getConfigOverlay: ReturnType<typeof vi.fn>;
  getConfigSchema: ReturnType<typeof vi.fn>;
  putConfigOverlay: ReturnType<typeof vi.fn>;
}

function createStorage() {
  return {
    setItem: vi.fn(),
  };
}

function createToast() {
  return vi.fn();
}

function createApi(configValues: Array<Record<string, unknown>>): FakeSettingsApi {
  let index = 0;
  return {
    getConfig: vi.fn(async () => configValues[Math.min(index++, configValues.length - 1)]),
    getConfigOverlay: vi.fn(async () => ({ overlay: {} })),
    getConfigSchema: vi.fn(async () => null),
    putConfigOverlay: vi.fn(async () => ({ updated: ["tracker.project_slug"], overlay: {} })),
  };
}

function createWorkbench(configValues: Array<Record<string, unknown>>) {
  const api = createApi(configValues);
  const toast = createToast();
  const storage = createStorage();
  const workbench = createSettingsWorkbench({
    state: {
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
    },
    deps: { api, toast, storage },
  });
  return { api, toast, storage, workbench };
}

describe("settings-workbench", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the effective config, overlay, and schema into the workbench state", async () => {
    const { api, workbench } = createWorkbench([{ tracker: { project_slug: "NIN" } }]);

    await workbench.load();

    expect(api.getConfig).toHaveBeenCalledTimes(1);
    expect(workbench.loadState.error).toBeNull();
    expect(workbench.loadState.data?.effective).toEqual({ tracker: { project_slug: "NIN" } });
    expect(workbench.state.effective).toEqual({ tracker: { project_slug: "NIN" } });
    expect(workbench.state.overlay).toEqual({});
    expect(workbench.state.schema).toBeNull();
  });

  it("saves one section through a patch plan and reloads the latest settings", async () => {
    const { api, toast, workbench } = createWorkbench([
      { tracker: { project_slug: "NIN" } },
      { tracker: { project_slug: "NIN-2" } },
    ]);

    await workbench.load();
    workbench.setDraftValue("tracker", "tracker.project_slug", "NIN-2");

    await workbench.saveSection("tracker");

    expect(api.putConfigOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          tracker: expect.objectContaining({
            project_slug: "NIN-2",
          }),
        }),
      }),
    );
    expect(api.getConfig).toHaveBeenCalledTimes(2);
    expect(workbench.state.effective).toEqual({ tracker: { project_slug: "NIN-2" } });
    expect(workbench.state.savingSectionId).toBeNull();
    expect(toast).toHaveBeenCalledWith("Tracker updated.", "success");
  });

  it("reverts section drafts back to the loaded effective values", async () => {
    const { workbench } = createWorkbench([{ tracker: { project_slug: "NIN" } }]);

    await workbench.load();
    workbench.setDraftValue("tracker", "tracker.project_slug", "NIN-2");

    expect(workbench.isSectionDirty("tracker")).toBe(true);

    workbench.revertSection("tracker");

    expect(workbench.state.drafts.tracker?.["tracker.project_slug"]).toBe("NIN");
    expect(workbench.isSectionDirty("tracker")).toBe(false);
  });

  it("persists mode changes and falls back when the current section is hidden", async () => {
    const storage = createStorage();
    const toast = createToast();
    const api = createApi([{ tracker: { project_slug: "NIN" } }]);
    const workbench = createSettingsWorkbench({
      state: {
        effective: {},
        overlay: {},
        schema: null,
        savingSectionId: null,
        error: null,
        filter: "",
        selectedSectionId: "credentials",
        drafts: {},
        expandedDiffs: new Set<string>(),
        expandedPaths: new Set<string>(),
        openExperts: new Set<string>(),
        mode: "advanced",
      },
      deps: { api, toast, storage },
    });

    await workbench.load();
    workbench.setMode("simple");

    expect(storage.setItem).toHaveBeenCalledWith("risoluto.settingsMode", "simple");
    expect(workbench.state.mode).toBe("simple");
    expect(workbench.state.selectedSectionId).not.toBe("credentials");
  });

  it("emits a change when selecting a Linear project programmatically", async () => {
    const { toast, workbench } = createWorkbench([{ tracker: { project_slug: "NIN" } }]);
    const listener = vi.fn();
    workbench.subscribe(listener);

    await workbench.load();
    listener.mockClear();

    workbench.setLinearProject("tracker.project_slug", "NIN-2");

    expect(workbench.state.drafts.tracker?.["tracker.project_slug"]).toBe("NIN-2");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Project slug set to NIN-2", "success");
  });
});
