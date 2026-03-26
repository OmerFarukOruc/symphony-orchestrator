import { createPageHeader } from "../components/page-header.js";
import { registerPageCleanup } from "../utils/page.js";
import {
  normalizeLegacySettingsPath,
  parseSettingsSectionHash,
  settingsPathForSection,
  type SettingsSectionHash,
} from "../utils/settings-tabs.js";

import { createConfigState } from "./config-state.js";
import { createConfigPage } from "./config-view.js";
import { createSecretsState } from "./secrets-state.js";
import { createSecretsPage } from "./secrets-view.js";
import { createSettingsState } from "./settings-state.js";
import { createSettingsPage } from "./settings-view.js";

interface UnifiedSettingsCache {
  advancedState: ReturnType<typeof createConfigState>;
  credentialsState: ReturnType<typeof createSecretsState>;
  generalState: ReturnType<typeof createSettingsState>;
}

let cachedState: UnifiedSettingsCache | null = null;

function getCachedState(): UnifiedSettingsCache {
  if (cachedState) {
    return cachedState;
  }
  cachedState = {
    generalState: createSettingsState(),
    credentialsState: createSecretsState(),
    advancedState: createConfigState(),
  };
  return cachedState;
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

function readRequestedSection(): { section: SettingsSectionHash | null; shouldReplace: boolean } {
  const legacySection = normalizeLegacySettingsPath(window.location.pathname);
  if (legacySection) {
    return { section: legacySection, shouldReplace: true };
  }
  return { section: parseSettingsSectionHash(window.location.hash), shouldReplace: false };
}

function scrollToSection(section: SettingsSectionHash, container: HTMLElement): void {
  if (section === "credentials") {
    const credentialsEl = container.querySelector<HTMLElement>(".settings-credentials-section");
    credentialsEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (section === "devtools") {
    const devtoolsEl = container.querySelector<HTMLDetailsElement>(".settings-devtools-section");
    if (devtoolsEl) {
      devtoolsEl.open = true;
      devtoolsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function buildCredentialsSection(state: UnifiedSettingsCache): HTMLElement {
  const section = document.createElement("section");
  section.className = "settings-credentials-section mc-panel";

  const secretsPage = createSecretsPage({ state: state.credentialsState });
  const extracted = extractHeader(secretsPage);

  const sectionHeader = document.createElement("div");
  sectionHeader.className = "settings-section-header";
  const headerRow = document.createElement("div");
  headerRow.className = "settings-section-header-row";
  const headerCopy = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = "Credentials";
  const description = document.createElement("p");
  description.textContent = "Manage encrypted API keys and tokens. Values remain write-only after save.";
  headerCopy.append(heading, description);
  headerRow.append(headerCopy);
  if (extracted.actions.length > 0) {
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "settings-section-header-actions";
    actionsWrap.append(...extracted.actions);
    headerRow.append(actionsWrap);
  }
  sectionHeader.append(headerRow);

  section.append(sectionHeader, secretsPage);
  return section;
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
  const state = getCachedState();
  const requested = readRequestedSection();

  if (requested.shouldReplace && requested.section) {
    window.history.replaceState({}, "", settingsPathForSection(requested.section));
  }

  const page = document.createElement("div");
  page.className = "page settings-unified-page fade-in";

  const header = createPageHeader("Settings", "Manage configuration, credentials, and developer tools in one place.");

  const body = document.createElement("div");
  body.className = "settings-unified-body";

  const generalSection = createSettingsPage({ state: state.generalState });
  const credentialsSection = buildCredentialsSection(state);
  const devtoolsSection = buildDevtoolsSection(state);

  body.append(generalSection, credentialsSection, devtoolsSection);
  page.append(header, body);

  // Scroll to requested section after initial render
  if (requested.section) {
    const targetSection = requested.section;
    requestAnimationFrame(() => {
      scrollToSection(targetSection, page);
    });
  }

  const onHashChange = (): void => {
    const next = readRequestedSection();
    if (next.shouldReplace && next.section) {
      window.history.replaceState({}, "", settingsPathForSection(next.section));
    }
    if (next.section) {
      scrollToSection(next.section, page);
    }
  };

  window.addEventListener("hashchange", onHashChange);

  registerPageCleanup(page, () => {
    window.removeEventListener("hashchange", onHashChange);
    cachedState = null;
  });

  return page;
}
