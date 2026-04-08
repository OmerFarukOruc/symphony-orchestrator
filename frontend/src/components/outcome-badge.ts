import { createIcon, type IconName } from "../ui/icons";

/**
 * Run outcome types matching `RunOutcome` from the backend.
 * Kept as a string union rather than importing the backend type
 * so the frontend bundle stays independent.
 */
export type OutcomeKind = "success" | "error" | "cancelled" | "timeout" | "stall";

interface OutcomeTheme {
  icon: IconName;
  label: string;
  cssClass: string;
  colorVar: string;
}

const OUTCOME_THEMES: Record<OutcomeKind, OutcomeTheme> = {
  success: {
    icon: "outcomeSuccess",
    label: "Success",
    cssClass: "outcome-badge--success",
    colorVar: "var(--status-completed)",
  },
  error: {
    icon: "outcomeError",
    label: "Error",
    cssClass: "outcome-badge--error",
    colorVar: "var(--status-blocked)",
  },
  cancelled: {
    icon: "outcomeCancelled",
    label: "Cancelled",
    cssClass: "outcome-badge--cancelled",
    colorVar: "var(--status-cancelled)",
  },
  timeout: {
    icon: "outcomeTimeout",
    label: "Timeout",
    cssClass: "outcome-badge--timeout",
    colorVar: "var(--severity-high)",
  },
  stall: {
    icon: "outcomeStall",
    label: "Stall",
    cssClass: "outcome-badge--stall",
    colorVar: "var(--status-retrying)",
  },
};

/** Maps runtime issue status strings to outcome kinds. */
export const STATUS_TO_OUTCOME: Record<string, OutcomeKind> = {
  completed: "success",
  closed: "success",
  failed: "error",
  cancelled: "cancelled",
  timed_out: "timeout",
  stalled: "stall",
};

export interface OutcomeBadgeOptions {
  /** Show the text label alongside the icon. Default: true */
  showLabel?: boolean;
  /** Icon size in px. Default: 14 */
  iconSize?: number;
}

/**
 * Creates a compact inline badge for a run outcome.
 *
 * ```html
 * <span class="mc-badge outcome-badge outcome-badge--success">
 *   <svg …/>
 *   <span>Success</span>
 * </span>
 * ```
 */
export function createOutcomeBadge(outcome: OutcomeKind, options: OutcomeBadgeOptions = {}): HTMLElement {
  const { showLabel = true, iconSize = 14 } = options;
  const theme = OUTCOME_THEMES[outcome];

  const badge = document.createElement("span");
  badge.className = `mc-badge outcome-badge ${theme.cssClass}`;
  badge.style.setProperty("--outcome-color", theme.colorVar);
  badge.setAttribute("aria-label", theme.label);

  const iconEl = createIcon(theme.icon, { size: iconSize });
  iconEl.setAttribute("aria-hidden", "true");
  badge.append(iconEl);

  if (showLabel) {
    const labelEl = document.createElement("span");
    labelEl.className = "outcome-badge-label";
    labelEl.textContent = theme.label;
    badge.append(labelEl);
  }

  return badge;
}

/**
 * Formats a duration in milliseconds to a compact human-readable string.
 * Examples: "1.2s", "45s", "2m 14s", "1h 3m"
 */
export function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
