import type { RateLimits } from "../types";

function asDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function formatTokenUsage(value: number | null | undefined): string {
  if (!value) {
    return "—";
  }
  return `${formatCompactNumber(value).toLowerCase()} tokens`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return "—";
  }
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatRelativeTime(value: string | null | undefined): string {
  const date = asDate(value);
  if (!date) {
    return "—";
  }
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);
  if (absolute < 5) {
    return "just now";
  }
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, size] of units) {
    if (absolute >= size || unit === "second") {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(diffSeconds / size), unit);
    }
  }
  return "—";
}

export function formatTimestamp(value: string | null | undefined): string {
  const date = asDate(value);
  if (!date) {
    return "—";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatShortTime(value: string | null | undefined): string {
  const date = asDate(value);
  if (!date) {
    return "—";
  }
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRateLimitHeadroom(rateLimits: RateLimits | null): string {
  if (!rateLimits || typeof rateLimits !== "object") {
    return "N/A";
  }
  const record = rateLimits as Record<string, unknown>;
  const limit = Number(record.limit ?? record.total ?? 0);
  const remaining = Number(record.remaining ?? 0);
  if (!limit || Number.isNaN(limit) || Number.isNaN(remaining)) {
    return "N/A";
  }
  return `${((remaining / limit) * 100).toFixed(1)}%`;
}

export function computeDurationSeconds(
  start: string | null | undefined,
  end?: string | null | undefined,
): number | null {
  const startDate = asDate(start);
  if (!startDate) {
    return null;
  }
  const endDate = asDate(end) ?? new Date();
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
}
