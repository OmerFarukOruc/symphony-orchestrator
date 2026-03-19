type Theme = "dark" | "light";

const STORAGE_KEY = "symphony-theme";

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent("theme:change", { detail: theme }));
}

export function getTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

export function initTheme(): void {
  applyTheme(getTheme());
}

export function toggleTheme(): Theme {
  const next = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
