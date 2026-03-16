import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

interface FlagStore {
  flags: Record<string, boolean>;
  source: "env" | "file" | "default";
  loadedAt: string;
}

const store: FlagStore = {
  flags: {},
  source: "default",
  loadedAt: new Date().toISOString(),
};

/**
 * Load feature flags from environment variable and/or a flags.json file.
 *
 * - `SYMPHONY_FLAGS` env var: comma-separated list of flag names to enable
 *   (e.g. "new_dashboard,parallel_agents")
 * - `flags.json` in `flagsDir` (defaults to cwd): JSON object mapping
 *   flag names to boolean values
 *
 * Env-based flags are loaded first; file-based flags merge on top.
 */
export function loadFlags(flagsDir?: string): void {
  const envFlags = process.env.SYMPHONY_FLAGS;
  if (envFlags) {
    for (const flag of envFlags
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean)) {
      store.flags[flag] = true;
    }
    store.source = "env";
  }

  const flagsPath = path.join(flagsDir ?? process.cwd(), "flags.json");
  if (existsSync(flagsPath)) {
    try {
      const raw = JSON.parse(readFileSync(flagsPath, "utf-8")) as Record<string, unknown>;
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === "boolean") {
          store.flags[key] = value;
        }
      }
      if (store.source === "default") {
        store.source = "file";
      }
    } catch {
      // Malformed flags.json — silently skip, flags stay as-is.
    }
  }

  store.loadedAt = new Date().toISOString();
}

/** Check whether a named feature flag is enabled. Defaults to false. */
export function isEnabled(flag: string): boolean {
  return store.flags[flag] ?? false;
}

/** Programmatically set a flag (useful for tests and runtime overrides). */
export function setFlag(flag: string, value: boolean): void {
  store.flags[flag] = value;
}

/** Return a snapshot of all currently loaded flags. */
export function getAllFlags(): Readonly<Record<string, boolean>> {
  return { ...store.flags };
}

/** Return metadata about how flags were loaded. */
export function getFlagsMeta(): {
  source: string;
  loadedAt: string;
  count: number;
} {
  return {
    source: store.source,
    loadedAt: store.loadedAt,
    count: Object.keys(store.flags).length,
  };
}

/** Reset all flags to empty (primarily for test isolation). */
export function resetFlags(): void {
  store.flags = {};
  store.source = "default";
  store.loadedAt = new Date().toISOString();
}
