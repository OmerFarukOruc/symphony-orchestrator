/**
 * Shared quarantine types and utilities.
 *
 * Used by: quarantine.ts (CLI), quarantine-heal.ts (nightly), and
 * tests/helpers/quarantine.ts (Vitest setup).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export interface QuarantineEntry {
  testName: string;
  file: string;
  quarantinedAt: string;
  passCount: number;
}

/** Maximum number of tests that can be quarantined at once. */
export const MAX_QUARANTINED = 5;

/** Number of consecutive nightly passes before a test is auto-healed. */
export const HEAL_THRESHOLD = 5;

export const QUARANTINE_PATH = path.resolve(import.meta.dirname, "../quarantine.json");

export function loadEntries(): QuarantineEntry[] {
  try {
    const raw = readFileSync(QUARANTINE_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QuarantineEntry[];
  } catch {
    return [];
  }
}
