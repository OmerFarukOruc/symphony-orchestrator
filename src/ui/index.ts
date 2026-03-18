/// <reference lib="dom" />

/**
 * Symphony Design System
 *
 * Exports design tokens and utilities for use in template files.
 */

/**
 * Inline CSS for templates that can't import external stylesheets.
 * Use this for server-rendered HTML templates.
 */
export const designSystemCSS = `/* Design tokens are in design-system.css */`;

/**
 * Theme preference storage key
 */
export const THEME_STORAGE_KEY = "symphony-theme";

/**
 * Get the current theme from storage or system preference
 */
export function getPreferredTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: "light" | "dark"): void {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
}

/**
 * Theme toggle script to inject into templates
 */
export const themeToggleScript = `
(function() {
  const key = "${THEME_STORAGE_KEY}";
  const stored = localStorage.getItem(key);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = stored || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.add(theme);
})();
`;

/**
 * Generate theme toggle button HTML
 */
export function renderThemeToggle(): string {
  return `
<button
  class="btn-icon"
  id="themeToggle"
  title="Toggle theme"
  aria-label="Toggle light/dark theme"
>
  <span class="icon theme-icon-light">☀</span>
  <span class="icon theme-icon-dark" style="display:none">☾</span>
</button>
<script>
(function() {
  const btn = document.getElementById("themeToggle");
  const lightIcon = btn.querySelector(".theme-icon-light");
  const darkIcon = btn.querySelector(".theme-icon-dark");

  function updateIcons(theme) {
    lightIcon.style.display = theme === "light" ? "inline-flex" : "none";
    darkIcon.style.display = theme === "dark" ? "inline-flex" : "none";
  }

  updateIcons(document.documentElement.getAttribute("data-theme") || "light");

  btn.addEventListener("click", function() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    localStorage.setItem("${THEME_STORAGE_KEY}", next);
    updateIcons(next);
  });
})();
</script>`;
}

/**
 * Generate a badge/pill element
 */
export function renderBadge(
  text: string,
  variant:
    | "identifier"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "brand"
    | "priority-high"
    | "priority-medium"
    | "priority-low" = "identifier",
): string {
  return `<span class="badge badge-${variant}">${escapeHtml(text)}</span>`;
}

/**
 * Generate a button element
 */
export function renderButton(
  text: string,
  options: {
    variant?: "primary" | "secondary" | "ghost";
    id?: string;
    onClick?: string;
    disabled?: boolean;
    icon?: string;
  } = {},
): string {
  const { variant = "primary", id, onClick, disabled, icon } = options;
  const idAttr = id ? ` id="${id}"` : "";
  const onClickAttr = onClick ? ` onclick="${onClick}"` : "";
  const disabledAttr = disabled ? " disabled" : "";
  const iconHtml = icon ? `<span class="icon">${icon}</span>` : "";

  return `<button class="btn btn-${variant}"${idAttr}${onClickAttr}${disabledAttr}>${iconHtml}${escapeHtml(text)}</button>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Color token values for programmatic use
 */
export const colors = {
  brand: {
    50: "#f0fdfa",
    100: "#ccfbf1",
    200: "#99f6e4",
    300: "#5eead4",
    400: "#2dd4bf",
    500: "#14b8a6",
    600: "#0d9488",
    700: "#0f766e",
    800: "#115e59",
    900: "#134e4a",
  },
  success: {
    50: "#f0fdf4",
    100: "#dcfce7",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
  },
  warning: {
    50: "#fffbeb",
    100: "#fef3c7",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
  },
  danger: {
    50: "#fef2f2",
    100: "#fee2e2",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
  },
  info: {
    50: "#eff6ff",
    100: "#dbeafe",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
  },
} as const;

/**
 * Spacing token values for programmatic use
 */
export const spacing = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
} as const;

/**
 * Border radius token values
 */
export const radius = {
  sm: "0.35rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  full: "999px",
} as const;
