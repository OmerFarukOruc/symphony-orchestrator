type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "risoluto-theme";

let mediaQueryList: MediaQueryList | null = null;
let listeningForSystemTheme = false;

function getMediaQueryList(): MediaQueryList {
  mediaQueryList ??= window.matchMedia("(prefers-color-scheme: dark)");
  return mediaQueryList;
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

function resolveTheme(theme: ThemePreference): Theme {
  return theme === "system" ? systemTheme() : theme;
}

function applyThemePreference(theme: ThemePreference): Theme {
  const resolvedTheme = resolveTheme(theme);
  document.documentElement.dataset.theme = resolvedTheme;
  localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(
    new CustomEvent("theme:change", {
      detail: { selection: theme, theme: resolvedTheme },
    }),
  );
  return resolvedTheme;
}

function syncSystemTheme(): void {
  if (getThemePreference() !== "system") {
    return;
  }
  applyThemePreference("system");
}

function ensureSystemThemeListener(): void {
  if (listeningForSystemTheme) {
    return;
  }
  getMediaQueryList().addEventListener("change", syncSystemTheme);
  listeningForSystemTheme = true;
}

export function systemTheme(): Theme {
  return getMediaQueryList().matches ? "dark" : "light";
}

export function getThemePreference(): ThemePreference {
  const storedPreference = localStorage.getItem(STORAGE_KEY);
  return isThemePreference(storedPreference) ? storedPreference : "system";
}

export function initTheme(): void {
  ensureSystemThemeListener();
  applyThemePreference(getThemePreference());
}

export function toggleTheme(): Theme {
  const currentPreference = getThemePreference();
  const nextPreference: Theme = currentPreference === "dark" ? "light" : "dark";
  return applyThemePreference(nextPreference);
}
