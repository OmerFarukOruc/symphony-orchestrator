import { describe, expect, it, vi } from "vitest";

import {
  computeDurationSeconds,
  formatBytes,
  formatCompactNumber,
  formatCostUsd,
  formatCountdown,
  formatDuration,
  formatRateLimitHeadroom,
  formatRelativeTime,
  formatTimestamp,
  formatTokenUsage,
} from "../../frontend/src/utils/format";

describe("formatCompactNumber", () => {
  it("returns dash for null, undefined, and NaN", () => {
    expect(formatCompactNumber(null)).toBe("—");
    expect(formatCompactNumber(undefined)).toBe("—");
    expect(formatCompactNumber(NaN)).toBe("—");
  });

  it("formats zero as standard notation", () => {
    expect(formatCompactNumber(0)).toBe("0");
  });

  it("formats numbers below 1000 without compact notation", () => {
    expect(formatCompactNumber(1)).toBe("1");
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(42)).toBe("42");
  });

  it("formats numbers at or above 1000 with compact notation", () => {
    expect(formatCompactNumber(1000)).toBe("1K");
    expect(formatCompactNumber(1500)).toBe("1.5K");
    expect(formatCompactNumber(10_000)).toBe("10K");
    expect(formatCompactNumber(1_000_000)).toBe("1M");
  });

  it("handles negative numbers below 1000 absolute value", () => {
    expect(formatCompactNumber(-42)).toBe("-42");
  });

  it("formats negative numbers above 1000 with standard notation (no compact)", () => {
    // The implementation checks `value >= 1000` — negative values fail that
    // check, so they use "standard" notation with locale grouping.
    const result = formatCompactNumber(-1500);
    expect(result).toMatch(/-1[,.]?500/);
  });

  it("handles very large numbers", () => {
    const result = formatCompactNumber(1_000_000_000);
    expect(result).toBe("1B");
  });
});

describe("formatTokenUsage", () => {
  it("returns dash for null, undefined, and zero", () => {
    expect(formatTokenUsage(null)).toBe("—");
    expect(formatTokenUsage(undefined)).toBe("—");
    expect(formatTokenUsage(0)).toBe("—");
  });

  it("formats token counts with suffix", () => {
    expect(formatTokenUsage(500)).toBe("500 tokens");
    expect(formatTokenUsage(2500)).toBe("2.5k tokens");
  });
});

describe("formatDuration", () => {
  it("returns dash for null, undefined, and NaN", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(NaN)).toBe("—");
  });

  it("formats zero seconds", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("formats seconds under a minute", () => {
    expect(formatDuration(5)).toBe("00:00:05");
    expect(formatDuration(59)).toBe("00:00:59");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("00:01:30");
    expect(formatDuration(3599)).toBe("00:59:59");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration(3600)).toBe("01:00:00");
    expect(formatDuration(3661)).toBe("01:01:01");
    expect(formatDuration(86400)).toBe("24:00:00");
  });

  it("clamps negative values to zero", () => {
    expect(formatDuration(-10)).toBe("00:00:00");
  });

  it("rounds fractional seconds", () => {
    expect(formatDuration(1.7)).toBe("00:00:02");
    expect(formatDuration(0.4)).toBe("00:00:00");
  });
});

describe("formatRelativeTime", () => {
  it("returns dash for null, undefined, and empty string", () => {
    expect(formatRelativeTime(null)).toBe("—");
    expect(formatRelativeTime(undefined)).toBe("—");
    expect(formatRelativeTime("")).toBe("—");
  });

  it("returns dash for invalid date strings", () => {
    expect(formatRelativeTime("not-a-date")).toBe("—");
  });

  it('returns "just now" for timestamps within 5 seconds of now', () => {
    const now = new Date();
    expect(formatRelativeTime(now.toISOString())).toBe("just now");
    expect(formatRelativeTime(new Date(now.getTime() - 3000).toISOString())).toBe("just now");
  });

  it("returns a relative time string for older timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00Z"));

    const tenSecondsAgo = "2026-03-26T11:59:50Z";
    expect(formatRelativeTime(tenSecondsAgo)).toBe("10 seconds ago");

    const twoMinutesAgo = "2026-03-26T11:58:00Z";
    expect(formatRelativeTime(twoMinutesAgo)).toBe("2 minutes ago");

    const oneHourAgo = "2026-03-26T11:00:00Z";
    expect(formatRelativeTime(oneHourAgo)).toBe("1 hour ago");

    vi.useRealTimers();
  });

  it("handles future timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00Z"));

    const tenSecondsFromNow = "2026-03-26T12:00:10Z";
    expect(formatRelativeTime(tenSecondsFromNow)).toBe("in 10 seconds");

    vi.useRealTimers();
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-03-26T12:00:00Z").getTime();

  it("returns dash for null, undefined, and empty string", () => {
    expect(formatCountdown(null, now)).toBe("—");
    expect(formatCountdown(undefined, now)).toBe("—");
    expect(formatCountdown("", now)).toBe("—");
  });

  it("returns dash for invalid dates", () => {
    expect(formatCountdown("garbage", now)).toBe("—");
  });

  it('returns "now" when the target is within 1 second', () => {
    expect(formatCountdown("2026-03-26T12:00:00Z", now)).toBe("now");
  });

  it("formats future countdowns with 'in' prefix", () => {
    expect(formatCountdown("2026-03-26T12:00:30Z", now)).toBe("in 30s");
    expect(formatCountdown("2026-03-26T12:05:00Z", now)).toBe("in 5m 0s");
    expect(formatCountdown("2026-03-26T13:30:45Z", now)).toBe("in 1h 30m 45s");
  });

  it("formats past countdowns with 'ago' suffix", () => {
    expect(formatCountdown("2026-03-26T11:59:30Z", now)).toBe("30s ago");
    expect(formatCountdown("2026-03-26T11:55:00Z", now)).toBe("5m 0s ago");
  });
});

describe("formatTimestamp", () => {
  it("returns dash for null, undefined, and invalid dates", () => {
    expect(formatTimestamp(null)).toBe("—");
    expect(formatTimestamp(undefined)).toBe("—");
    expect(formatTimestamp("bad-date")).toBe("—");
  });

  it("formats a valid ISO timestamp", () => {
    const result = formatTimestamp("2026-03-26T12:00:00Z");
    expect(result).toBeTruthy();
    expect(result).not.toBe("—");
    expect(result).toMatch(/Mar/);
  });
});

describe("formatRateLimitHeadroom", () => {
  it('returns "N/A" for null and non-object values', () => {
    expect(formatRateLimitHeadroom(null)).toBe("N/A");
  });

  it('returns "N/A" when limit is zero or missing', () => {
    expect(formatRateLimitHeadroom({})).toBe("N/A");
    expect(formatRateLimitHeadroom({ limit: 0, remaining: 50 })).toBe("N/A");
  });

  it("calculates headroom percentage from limit and remaining", () => {
    expect(formatRateLimitHeadroom({ limit: 100, remaining: 75 })).toBe("75.0%");
    expect(formatRateLimitHeadroom({ limit: 1000, remaining: 500 })).toBe("50.0%");
  });

  it("uses 'total' field as fallback for limit", () => {
    expect(formatRateLimitHeadroom({ total: 200, remaining: 100 })).toBe("50.0%");
  });

  it("handles full and empty headroom", () => {
    expect(formatRateLimitHeadroom({ limit: 100, remaining: 100 })).toBe("100.0%");
    expect(formatRateLimitHeadroom({ limit: 100, remaining: 0 })).toBe("0.0%");
  });
});

describe("computeDurationSeconds", () => {
  it("returns null when start is null, undefined, or invalid", () => {
    expect(computeDurationSeconds(null)).toBeNull();
    expect(computeDurationSeconds(undefined)).toBeNull();
    expect(computeDurationSeconds("bad")).toBeNull();
  });

  it("computes seconds between start and end", () => {
    const result = computeDurationSeconds("2026-03-26T12:00:00Z", "2026-03-26T12:05:00Z");
    expect(result).toBe(300);
  });

  it("falls back to Date.now() when end is missing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:01:00Z"));

    const result = computeDurationSeconds("2026-03-26T12:00:00Z");
    expect(result).toBe(60);

    vi.useRealTimers();
  });

  it("clamps negative duration to zero", () => {
    const result = computeDurationSeconds("2026-03-26T12:05:00Z", "2026-03-26T12:00:00Z");
    expect(result).toBe(0);
  });
});

describe("formatCostUsd", () => {
  it("returns dash for null and undefined", () => {
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
  });

  it("formats zero cost as currency", () => {
    const result = formatCostUsd(0);
    expect(result).toMatch(/\$0/);
  });

  it("formats a small fractional cost with up to 4 significant digits", () => {
    const result = formatCostUsd(0.0023);
    expect(result).toMatch(/\$0\.0023/);
  });

  it("formats a dollar-range cost", () => {
    const result = formatCostUsd(1.25);
    expect(result).toMatch(/\$1\.25/);
  });

  it("formats a sub-cent cost with significant digits", () => {
    const result = formatCostUsd(0.000023);
    expect(result).toMatch(/\$0\.000023/);
  });
});

describe("formatBytes", () => {
  it("returns dash for null, undefined, and negative values", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });

  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes without conversion", () => {
    expect(formatBytes(100)).toBe("100 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    // Exact unit boundaries use .toFixed(1) because value < 10 && i > 0
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10_240)).toBe("10 KB");
    expect(formatBytes(15_360)).toBe("15 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1_048_576)).toBe("1.0 MB");
    expect(formatBytes(5_242_880)).toBe("5.0 MB");
    expect(formatBytes(9_961_472)).toBe("9.5 MB");
    expect(formatBytes(10_485_760)).toBe("10 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1_073_741_824)).toBe("1.0 GB");
  });

  it("formats terabytes", () => {
    expect(formatBytes(1_099_511_627_776)).toBe("1.0 TB");
  });
});
