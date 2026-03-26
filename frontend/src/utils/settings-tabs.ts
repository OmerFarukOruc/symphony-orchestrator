export type SettingsSectionHash = "credentials" | "devtools";

const DEFAULT_SETTINGS_PATH = "/settings";

const sectionHashes = new Set<SettingsSectionHash>(["credentials", "devtools"]);

function isSettingsSectionHash(value: string | null | undefined): value is SettingsSectionHash {
  return value !== undefined && value !== null && sectionHashes.has(value as SettingsSectionHash);
}

export function parseSettingsSectionHash(hash: string): SettingsSectionHash | null {
  const normalized = hash.replace(/^#/, "").trim().toLowerCase();
  return isSettingsSectionHash(normalized) ? normalized : null;
}

export function settingsPathForSection(section: SettingsSectionHash | null): string {
  return section ? `/settings#${section}` : DEFAULT_SETTINGS_PATH;
}

export function normalizeLegacySettingsPath(pathname: string): SettingsSectionHash | null {
  if (pathname === "/config") {
    return "devtools";
  }
  if (pathname === "/secrets") {
    return "credentials";
  }
  return null;
}
