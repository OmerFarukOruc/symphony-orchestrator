import { api } from "../../api.js";
import { toast } from "../../ui/toast.js";
import { createAsyncState, handleError, type AsyncState, withLoading } from "../../utils/async-state.js";

import {
  buildSettingsSections,
  ensureSectionDrafts,
  formatFieldDraft,
  getSectionById,
  sectionHasUnsavedDrafts,
  sectionMatchesFilter,
  sectionVisibleInMode,
} from "./settings-helpers.js";
import { buildSectionPatchPlan } from "./settings-patches.js";
import { getValueAtPath } from "./settings-paths.js";
import { createSettingsState, type SettingsState } from "./settings-state.js";
import { isSettingsPageData, type SettingsPageData } from "./settings-view-render.js";
import type { SettingsMode, SettingsSectionDefinition } from "./settings-types.js";

type SettingsApi = Pick<typeof api, "getConfig" | "getConfigOverlay" | "getConfigSchema" | "putConfigOverlay">;
type ToastFn = typeof toast;
type SettingsStorage = Pick<Storage, "setItem">;

interface SettingsWorkbenchDeps {
  api: SettingsApi;
  toast: ToastFn;
  storage: SettingsStorage;
}

interface CreateSettingsWorkbenchOptions {
  state?: SettingsState;
  loadState?: AsyncState<SettingsPageData>;
  deps?: Partial<SettingsWorkbenchDeps>;
}

export interface SettingsWorkbench {
  readonly state: SettingsState;
  readonly loadState: AsyncState<SettingsPageData>;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  saveSection(sectionId: string): Promise<void>;
  revertSection(sectionId: string): void;
  setFilter(value: string): void;
  selectSection(sectionId: string): void;
  toggleDiff(sectionId: string): void;
  togglePaths(sectionId: string): void;
  setMode(mode: SettingsMode): void;
  setDraftValue(sectionId: string, fieldPath: string, value: string): void;
  focusSection(sectionId: string): void;
  setLinearProject(fieldPath: string, slugId: string): void;
  currentVisibleSectionId(): string;
  isSectionDirty(sectionId: string): boolean;
}

function resolveSettingsStorage(): SettingsStorage {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return {
    setItem() {
      // Non-browser tests can inject a storage double; otherwise mode persistence
      // is a no-op fallback.
    },
  };
}

export function createSettingsWorkbench(options: CreateSettingsWorkbenchOptions = {}): SettingsWorkbench {
  const state = options.state ?? createSettingsState();
  const loadState = options.loadState ?? createAsyncState<SettingsPageData>();
  const deps: SettingsWorkbenchDeps = {
    api,
    toast,
    storage: resolveSettingsStorage(),
    ...options.deps,
  };
  const listeners = new Set<() => void>();

  const emitChange = (): void => {
    listeners.forEach((listener) => listener());
  };

  const getSections = (): SettingsSectionDefinition[] => buildSettingsSections(state.schema, state.effective);

  const syncLoadedData = (data: SettingsPageData): void => {
    state.effective = data.effective;
    state.overlay = data.overlay;
    state.schema = data.schema;
    const sections = getSections();
    if (!sections.some((section) => section.id === state.selectedSectionId)) {
      state.selectedSectionId = sections[0]?.id ?? "tracker";
    }
  };

  const getVisibleSections = (): SettingsSectionDefinition[] =>
    getSections().filter(
      (section) =>
        sectionVisibleInMode(section, state.mode) &&
        sectionMatchesFilter(section, state.filter, state.drafts[section.id]),
    );

  const getSection = (sectionId: string): SettingsSectionDefinition | undefined =>
    getSectionById(state.schema, state.effective, sectionId);

  const workbench: SettingsWorkbench = {
    state,
    loadState,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async load(): Promise<void> {
      loadState.error = null;
      state.error = null;
      try {
        loadState.data = await withLoading(
          loadState,
          async () => {
            const [effective, overlayResponse, schema] = await Promise.all([
              deps.api.getConfig(),
              deps.api.getConfigOverlay(),
              deps.api.getConfigSchema().catch(() => null),
            ]);
            return {
              effective,
              overlay: overlayResponse.overlay,
              schema: isSettingsPageData(schema) ? schema : null,
            };
          },
          { onChange: emitChange },
        );
        if (loadState.data) {
          syncLoadedData(loadState.data);
        }
      } catch (error) {
        handleError(loadState, error, "Failed to load settings.");
      }
      emitChange();
    },
    async saveSection(sectionId: string): Promise<void> {
      if (!loadState.data) {
        return;
      }
      const section = getSection(sectionId);
      if (!section || state.savingSectionId) {
        return;
      }
      const drafts = ensureSectionDrafts(state.drafts, section, state.effective);
      const plan = buildSectionPatchPlan(section, drafts, state.effective);
      if (plan.errors.length > 0) {
        const message = plan.errors.map((error) => error.message).join(" ");
        state.error = message;
        deps.toast(message, "error");
        emitChange();
        return;
      }
      if (!plan.entries.length) {
        deps.toast(`No changes to save for ${section.title}.`, "info");
        return;
      }
      state.savingSectionId = section.id;
      state.error = null;
      emitChange();
      try {
        await deps.api.putConfigOverlay({ patch: plan.patch });
        deps.toast(`${section.title} updated.`, "success");
        await workbench.load();
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to save ${section.title}.`;
        state.error = message;
        deps.toast(message, "error");
        emitChange();
      } finally {
        state.savingSectionId = null;
        emitChange();
      }
    },
    revertSection(sectionId: string): void {
      const section = getSection(sectionId);
      if (!section) {
        return;
      }
      const drafts = ensureSectionDrafts(state.drafts, section, state.effective);
      section.fields.forEach((field) => {
        drafts[field.path] = formatFieldDraft(field, getValueAtPath(state.effective, field.path));
      });
      state.error = null;
      state.selectedSectionId = sectionId;
      emitChange();
    },
    setFilter(value: string): void {
      state.filter = value;
      const visible = getVisibleSections();
      if (!visible.some((section) => section.id === state.selectedSectionId)) {
        state.selectedSectionId = visible[0]?.id ?? state.selectedSectionId;
      }
      emitChange();
    },
    selectSection(sectionId: string): void {
      state.selectedSectionId = sectionId;
    },
    toggleDiff(sectionId: string): void {
      if (state.expandedDiffs.has(sectionId)) {
        state.expandedDiffs.delete(sectionId);
      } else {
        state.expandedDiffs.add(sectionId);
      }
      state.selectedSectionId = sectionId;
      emitChange();
    },
    togglePaths(sectionId: string): void {
      if (state.expandedPaths.has(sectionId)) {
        state.expandedPaths.delete(sectionId);
      } else {
        state.expandedPaths.add(sectionId);
      }
      state.selectedSectionId = sectionId;
      emitChange();
    },
    setMode(mode: SettingsMode): void {
      state.mode = mode;
      deps.storage.setItem("risoluto.settingsMode", mode);
      const visible = getVisibleSections();
      if (!visible.some((section) => section.id === state.selectedSectionId)) {
        state.selectedSectionId = visible[0]?.id ?? "tracker";
      }
      emitChange();
    },
    setDraftValue(sectionId: string, fieldPath: string, value: string): void {
      const section = getSection(sectionId);
      if (!section) {
        return;
      }
      const drafts = ensureSectionDrafts(state.drafts, section, state.effective);
      drafts[fieldPath] = value;
      state.error = null;
      state.selectedSectionId = sectionId;
    },
    focusSection(sectionId: string): void {
      state.selectedSectionId = sectionId;
    },
    setLinearProject(fieldPath: string, slugId: string): void {
      workbench.setDraftValue("tracker", fieldPath, slugId);
      emitChange();
      deps.toast(`Project slug set to ${slugId}`, "success");
    },
    currentVisibleSectionId(): string {
      const visibleSections = getVisibleSections();
      return visibleSections.some((section) => section.id === state.selectedSectionId)
        ? state.selectedSectionId
        : (visibleSections[0]?.id ?? state.selectedSectionId);
    },
    isSectionDirty(sectionId: string): boolean {
      const section = getSection(sectionId);
      if (!section) {
        return false;
      }
      return sectionHasUnsavedDrafts(section, state.drafts[sectionId], state.effective);
    },
  };

  return workbench;
}
