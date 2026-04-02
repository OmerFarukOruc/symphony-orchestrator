/**
 * Vitest setup file — flaky test quarantine mechanism.
 *
 * Reads `quarantine.json` at import time and registers a global `beforeEach`
 * hook that checks the current test's name and file path against the quarantine
 * map. When `QUARANTINE_ENFORCE` is `true` (the default) and the test matches,
 * it is skipped via `ctx.skip()`. In nightly healing runs where
 * `QUARANTINE_ENFORCE=false`, quarantined tests run normally so the healing
 * script can check whether they pass.
 *
 * This is a zero-import mechanism — no existing test files need modification.
 * The setup file is registered in `vitest.config.ts` and
 * `vitest.integration.config.ts` via the `setupFiles` array.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach } from "vitest";

import type { QuarantineEntry } from "../../scripts/quarantine-shared.js";

const QUARANTINE_PATH = path.resolve(import.meta.dirname, "../../quarantine.json");

/** Build the lookup map: Map<normalizedFilePath, Set<testName>> */
function loadQuarantineMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  try {
    const raw = readFileSync(QUARANTINE_PATH, "utf-8");
    const entries: QuarantineEntry[] = JSON.parse(raw);

    if (!Array.isArray(entries)) return map;

    for (const entry of entries) {
      const normalizedFile = path.resolve(entry.file);
      const existing = map.get(normalizedFile);
      if (existing) {
        existing.add(entry.testName);
      } else {
        map.set(normalizedFile, new Set([entry.testName]));
      }
    }
  } catch {
    // If quarantine.json is missing or malformed, no tests are quarantined.
  }

  return map;
}

const quarantineMap = loadQuarantineMap();
const enforce = process.env.QUARANTINE_ENFORCE !== "false";

if (quarantineMap.size > 0) {
  beforeEach((ctx) => {
    if (!enforce) return;

    const testName = ctx.task.name;
    const filePath = ctx.task.file?.name;

    if (!filePath) return;

    const normalizedFile = path.resolve(filePath);
    const quarantinedNames = quarantineMap.get(normalizedFile);

    if (quarantinedNames?.has(testName)) {
      ctx.skip();
    }
  });
}
