/**
 * Deep merge and clone utilities for config objects.
 *
 * These utilities handle merging overlay configs into base configs
 * with array replacement semantics and deep object merging.
 */

import { asRecord } from "./coercion.js";

/**
 * Deep merge overlay into base.
 *
 * - Arrays in overlay replace arrays in base entirely
 * - Objects are merged recursively
 * - Primitives in overlay replace those in base
 */
export function deepMerge(base: unknown, overlay: unknown): unknown {
  if (Array.isArray(overlay)) {
    return [...overlay];
  }
  if (typeof overlay !== "object" || overlay === null) {
    return overlay;
  }
  const baseRecord = asRecord(base);
  const overlayRecord = asRecord(overlay);
  const merged: Record<string, unknown> = { ...baseRecord };
  for (const [key, value] of Object.entries(overlayRecord)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = deepMerge(baseRecord[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

/**
 * Create a deep clone of a config map using JSON serialization.
 * Note: This only works for JSON-serializable values.
 */
export function cloneConfigMap(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>;
}
