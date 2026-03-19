export interface ConfigEntry {
  path: string;
  value: unknown;
  source: "overlay" | "effective";
}

export function flattenConfig(
  value: Record<string, unknown>,
  source: "overlay" | "effective",
  prefix = "",
): ConfigEntry[] {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return flattenConfig(nested as Record<string, unknown>, source, path);
    }
    return [{ path, value: nested, source }];
  });
}

export function redactPath(path: string, value: unknown): string {
  const lowered = path.toLowerCase();
  if (
    lowered.includes("secret") ||
    lowered.includes("token") ||
    lowered.includes("password") ||
    lowered.includes("key")
  ) {
    return "[redacted]";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function redactValue(value: unknown, prefix = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return [key, redactPath(path, nested) === "[redacted]" ? "[redacted]" : redactValue(nested, path)];
      }),
    );
  }
  return redactPath(prefix, value) === "[redacted]" ? "[redacted]" : value;
}

export function buildDiffText(effective: Record<string, unknown>, overlay: Record<string, unknown>): string {
  const effectiveEntries = new Map(
    flattenConfig(effective, "effective").map((entry) => [entry.path, redactPath(entry.path, entry.value)]),
  );
  const overlayEntries = flattenConfig(overlay, "overlay");
  if (overlayEntries.length === 0) {
    return "No persistent overrides yet.";
  }
  return overlayEntries
    .map((entry) => {
      const before = effectiveEntries.get(entry.path) ?? "∅";
      const after = redactPath(entry.path, entry.value);
      return `${entry.path}\n- ${before}\n+ ${after}`;
    })
    .join("\n\n");
}

export function parsePathValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
