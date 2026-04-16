import { createPageHeader } from "../../components/page-header.js";
import { registerPageCleanup } from "../../utils/page.js";
import {
  normalizeLegacySettingsPath,
  parseSettingsSectionHash,
  settingsPathForSection,
  type SettingsSectionHash,
} from "../../utils/settings-tabs.js";
import { createConfigState } from "../../views/config-state.js";
import { createConfigPage } from "../../views/config-view.js";
import { createCodexAdminSection } from "../../views/settings-codex-admin.js";

import { createSettingsPage } from "./settings-view.js";
import { createSettingsWorkbench } from "./settings-workbench.js";

interface UnifiedSettingsCache {
  advancedState: ReturnType<typeof createConfigState>;
  generalWorkbench: ReturnType<typeof createSettingsWorkbench>;
}

interface RequestedSettingsSection {
  section: SettingsSectionHash | null;
  shouldReplace: boolean;
}

let cachedState: UnifiedSettingsCache | null = null;

export function getUnifiedSettingsCache(): UnifiedSettingsCache {
  if (cachedState) {
    return cachedState;
  }
  cachedState = {
    generalWorkbench: createSettingsWorkbench(),
    advancedState: createConfigState(),
  };
  return cachedState;
}

export function clearUnifiedSettingsCache(): void {
  cachedState = null;
}

function extractHeader(root: HTMLElement): { actions: HTMLElement[]; subtitle: string } {
  const header = Array.from(root.children).find(
    (candidate): candidate is HTMLElement =>
      candidate instanceof HTMLElement && candidate.classList.contains("mc-strip"),
  );
  if (!header) {
    return { actions: [], subtitle: "" };
  }
  const subtitle = header.querySelector<HTMLElement>(".page-subtitle")?.textContent?.trim() ?? "";
  const primaryCopy = header.firstElementChild;
  const actions = Array.from(header.children).filter(
    (candidate): candidate is HTMLElement => candidate instanceof HTMLElement && candidate !== primaryCopy,
  );
  header.remove();
  return { actions, subtitle };
}

export function readRequestedSettingsSection(
  locationLike: Pick<Location, "pathname" | "hash"> = window.location,
): RequestedSettingsSection {
  const legacySection = normalizeLegacySettingsPath(locationLike.pathname);
  if (legacySection) {
    return { section: legacySection, shouldReplace: true };
  }
  return { section: parseSettingsSectionHash(locationLike.hash), shouldReplace: false };
}

export function syncRequestedSettingsSection(
  cache: UnifiedSettingsCache,
  requested: RequestedSettingsSection,
  historyLike: Pick<History, "replaceState"> = window.history,
): void {
  if (requested.section === "credentials" && cache.generalWorkbench.state.mode !== "advanced") {
    cache.generalWorkbench.state.mode = "advanced";
  }

  if (requested.shouldReplace && requested.section) {
    historyLike.replaceState({}, "", settingsPathForSection(requested.section));
  }
}

export function scrollToRequestedSettingsSection(section: SettingsSectionHash, container: HTMLElement): void {
  if (section === "credentials") {
    const credentialsEl = container.querySelector<HTMLElement>("#settings-credentials");
    credentialsEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (section === "devtools") {
    const devtoolsEl = container.querySelector<HTMLDetailsElement>(".settings-devtools-section");
    if (devtoolsEl) {
      devtoolsEl.open = true;
      devtoolsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function buildDevtoolsSection(state: UnifiedSettingsCache): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "settings-devtools-section mc-panel";

  const summary = document.createElement("summary");
  summary.textContent = "Developer tools \u2014 Raw JSON configuration editor";
  details.append(summary);

  const configPage = createConfigPage({ state: state.advancedState });
  extractHeader(configPage);
  configPage.classList.add("settings-devtools-content");

  details.append(configPage);
  return details;
}

export function createUnifiedSettingsPage(): HTMLElement {
  const state = getUnifiedSettingsCache();
  const requested = readRequestedSettingsSection();
  syncRequestedSettingsSection(state, requested);

  const page = document.createElement("div");
  page.className = "page settings-unified-page fade-in";

  const header = createPageHeader("Settings", "Manage configuration, credentials, and developer tools in one place.");

  const body = document.createElement("div");
  body.className = "settings-unified-body";

  const generalSection = createSettingsPage({ workbench: state.generalWorkbench });
  const { actions: innerActions } = extractHeader(generalSection);
  if (innerActions.length > 0) {
    header.append(...innerActions);
  }

  const codexAdminSection = createCodexAdminSection();
  const devtoolsSection = buildDevtoolsSection(state);

  body.append(generalSection, codexAdminSection, devtoolsSection);
  page.append(header, body);

  if (requested.section) {
    const targetSection = requested.section;
    requestAnimationFrame(() => {
      scrollToRequestedSettingsSection(targetSection, page);
    });
  }

  const onHashChange = (): void => {
    const next = readRequestedSettingsSection();
    syncRequestedSettingsSection(state, next);
    if (next.section) {
      scrollToRequestedSettingsSection(next.section, page);
    }
  };

  window.addEventListener("hashchange", onHashChange);

  registerPageCleanup(page, () => {
    window.removeEventListener("hashchange", onHashChange);
    clearUnifiedSettingsCache();
  });

  return page;
}
