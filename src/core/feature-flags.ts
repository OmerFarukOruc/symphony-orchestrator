import { readFileSync } from "node:fs";
import path from "node:path";

type FlagSource = "env" | "file" | "default";
type FlagFileStatus = "loaded" | "missing" | "malformed" | "not_checked";

interface FlagStore {
  flags: Record<string, boolean>;
  source: FlagSource;
  loadedAt: string;
  fileStatus: FlagFileStatus;
  parseError?: string;
}

const store: FlagStore = {
  flags: {},
  source: "default",
  loadedAt: new Date().toISOString(),
  fileStatus: "not_checked",
};

/** Result returned by loadFlags for structured boot diagnostics. */
export interface LoadFlagsResult {
  source: FlagSource;
  count: number;
  fileStatus: FlagFileStatus;
  parseError?: string;
}

/**
 * Load feature flags from environment variable and/or a flags.json file.
 *
 * - `SYMPHONY_FLAGS` env var: comma-separated list of flag names to enable
 *   (e.g. "new_dashboard,parallel_agents")
 * - `flags.json` in `flagsDir` (defaults to cwd): JSON object mapping
 *   flag names to boolean values
 *
 * Env-based flags are loaded first; file-based flags merge on top.
 * Returns structured status so callers can log or surface parse failures.
 *
 * Each call builds a fresh flag snapshot — previous state is replaced,
 * not accumulated into.
 */
function loadEnvFlags(flags: Record<string, boolean>): boolean {
  const envFlags = process.env.SYMPHONY_FLAGS;
  if (!envFlags) return false;
  for (const flag of envFlags
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)) {
    flags[flag] = true;
  }
  return true;
}

function loadFileFlags(
  flags: Record<string, boolean>,
  flagsDir: string | undefined,
): { fileStatus: FlagFileStatus; fromFile: boolean; parseError?: string } {
  const flagsPath = path.join(flagsDir ?? process.cwd(), "flags.json");
  try {
    const raw = JSON.parse(readFileSync(flagsPath, "utf-8")) as Record<string, unknown>;
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "boolean") {
        flags[key] = value;
      }
    }
    return { fileStatus: "loaded", fromFile: true };
  } catch (error_) {
    if (error_ instanceof Error && "code" in error_ && error_.code === "ENOENT") {
      return { fileStatus: "missing", fromFile: false };
    }
    return {
      fileStatus: "malformed",
      fromFile: false,
      parseError: error_ instanceof Error ? error_.message : String(error_),
    };
  }
}

export function loadFlags(flagsDir?: string): LoadFlagsResult {
  const freshFlags: Record<string, boolean> = {};
  const hadEnv = loadEnvFlags(freshFlags);
  const fileResult = loadFileFlags(freshFlags, flagsDir);

  const source: FlagSource = hadEnv ? "env" : fileResult.fromFile ? "file" : "default";

  store.flags = freshFlags;
  store.source = source;
  store.loadedAt = new Date().toISOString();
  store.fileStatus = fileResult.fileStatus;
  store.parseError = fileResult.parseError;

  return {
    source,
    count: Object.keys(freshFlags).length,
    fileStatus: fileResult.fileStatus,
    parseError: fileResult.parseError,
  };
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
  fileStatus: string;
  parseError?: string;
} {
  return {
    source: store.source,
    loadedAt: store.loadedAt,
    count: Object.keys(store.flags).length,
    fileStatus: store.fileStatus,
    parseError: store.parseError,
  };
}

/** Reset all flags to empty (primarily for test isolation). */
export function resetFlags(): void {
  store.flags = {};
  store.source = "default";
  store.loadedAt = new Date().toISOString();
  store.fileStatus = "not_checked";
  store.parseError = undefined;
}
