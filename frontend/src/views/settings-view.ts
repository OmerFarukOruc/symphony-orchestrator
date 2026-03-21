import { api } from "../api";
import { createPageHeader } from "../components/page-header";
import { openProjectPicker } from "../components/project-picker";
import { toast } from "../ui/toast";
import { registerPageCleanup } from "../utils/page";

import { buildSettingsSections, getSectionById, isSchemaLimited } from "./settings-helpers";
import { buildSectionPatchPlan } from "./settings-patches";
import { handleSettingsKeyboard } from "./settings-keyboard";
import { renderSettingsLayout } from "./settings-sections";
import { createSettingsState } from "./settings-state";

export function createSettingsPage(): HTMLElement {
  const state = createSettingsState();
  const page = document.createElement("div");
  page.className = "page settings-page fade-in";
  const schemaBadge = document.createElement("span");
  schemaBadge.className = "mc-badge";
  const header = createPageHeader("Settings", "", { actions: schemaBadge });
  const subtitleElement = header.querySelector(".page-subtitle");
  if (!(subtitleElement instanceof HTMLElement)) {
    throw new TypeError("Settings page header is missing a subtitle element.");
  }
  const subtitle = subtitleElement;
  const shell = document.createElement("section");
  shell.className = "settings-layout";
  const rail = document.createElement("aside");
  rail.className = "settings-rail";
  const content = document.createElement("main");
  content.className = "settings-content";
  const searchInput = Object.assign(document.createElement("input"), {
    className: "mc-input",
    placeholder: "Search settings…",
  });
  shell.append(rail, content);
  page.append(header, shell);

  async function load(): Promise<void> {
    state.loading = true;
    render();
    try {
      const [effective, overlayResponse, schema] = await Promise.all([
        api.getConfig(),
        api.getConfigOverlay(),
        api.getConfigSchema().catch(() => null),
      ]);
      state.effective = effective;
      state.overlay = overlayResponse.overlay;
      state.schema = (schema as Record<string, unknown> | null) ?? null;
      state.error = null;
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to load settings.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function saveSection(sectionId: string): Promise<void> {
    const section = getSectionById(state.schema, state.effective, sectionId);
    if (!section || state.savingSectionId) {
      return;
    }
    const drafts = state.drafts[section.id] ?? {};
    const plan = buildSectionPatchPlan(section, drafts, state.effective);
    if (plan.errors.length > 0) {
      const message = plan.errors.map((error) => error.message).join(" ");
      state.error = message;
      toast(message, "error");
      render();
      return;
    }
    if (!plan.entries.length) {
      toast(`No changes to save for ${section.title}.`, "info");
      return;
    }
    state.savingSectionId = section.id;
    state.error = null;
    render();
    try {
      await api.putConfigOverlay({ patch: plan.patch });
      toast(`${section.title} updated.`, "success");
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to save ${section.title}.`;
      state.error = message;
      toast(message, "error");
    } finally {
      state.savingSectionId = null;
      render();
    }
  }

  function currentVisibleSectionId(): string {
    const sections = buildSettingsSections(state.schema, state.effective);
    return sections.some((section) => section.id === state.selectedSectionId)
      ? state.selectedSectionId
      : (sections[0]?.id ?? state.selectedSectionId);
  }

  function render(): void {
    const sections = buildSettingsSections(state.schema, state.effective);
    if (!sections.some((section) => section.id === state.selectedSectionId)) {
      state.selectedSectionId = sections[0]?.id ?? "tracker";
    }
    subtitle.textContent = isSchemaLimited(state.schema)
      ? "Schema is limited, so these grouped cards fall back to shaped config views with plain underlying paths."
      : "Schema-aware grouped settings with live section diffs and operator-facing paths.";
    schemaBadge.textContent = isSchemaLimited(state.schema) ? "Schema limited" : "Schema guided";
    renderSettingsLayout(rail, content, searchInput, state, sections, {
      onFilter: (value) => {
        state.filter = value;
        render();
        searchInput.focus();
      },
      onSelectSection: (sectionId) => {
        state.selectedSectionId = sectionId;
        render();
        document.getElementById(`settings-${sectionId}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      },
      onToggleDiff: (sectionId) => {
        if (state.expandedDiffs.has(sectionId)) state.expandedDiffs.delete(sectionId);
        else state.expandedDiffs.add(sectionId);
        state.selectedSectionId = sectionId;
        render();
      },
      onTogglePaths: (sectionId) => {
        if (state.expandedPaths.has(sectionId)) state.expandedPaths.delete(sectionId);
        else state.expandedPaths.add(sectionId);
        state.selectedSectionId = sectionId;
        render();
      },
      onSaveSection: (sectionId) => void saveSection(sectionId),
      onFieldAction: (_sectionId, fieldPath, actionKind) => {
        if (actionKind === "browse-linear-projects") {
          openProjectPicker({
            onSelect: (slugId) => {
              const trackerDrafts = (state.drafts["tracker"] ??= {});
              trackerDrafts[fieldPath] = slugId;
              render();
              toast(`Project slug set to ${slugId}`, "success");
            },
          });
        }
      },
    });
  }

  const onKey = (event: KeyboardEvent): void => {
    handleSettingsKeyboard(event, {
      onFocusSearch: () => searchInput.focus(),
      onSaveCurrentSection: () => void saveSection(currentVisibleSectionId()),
    });
  };

  window.addEventListener("keydown", onKey);
  void load();
  registerPageCleanup(page, () => window.removeEventListener("keydown", onKey));
  return page;
}
