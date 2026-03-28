import { isRecord } from "../utils/type-guards.js";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isDangerousKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

export function normalizePathExpression(pathExpression: string): string[] {
  return pathExpression
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForStableStringify);
  }
  if (!isRecord(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    sorted[key] = sortForStableStringify(value[key]);
  }
  return sorted;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

export function mergeOverlayMaps(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const output = structuredClone(base) as Record<string, unknown>;

  for (const key of Object.keys(patch)) {
    if (isDangerousKey(key)) {
      continue;
    }
    const patchValue = patch[key];
    const baseValue = Object.hasOwn(output, key) ? output[key] : undefined;
    if (isRecord(baseValue) && isRecord(patchValue)) {
      output[key] = mergeOverlayMaps(baseValue, patchValue);
      continue;
    }
    output[key] = structuredClone(patchValue);
  }

  return output;
}

function handleDangerousKey(key: string, mode: "throw" | "ignore", action: string): boolean {
  if (!isDangerousKey(key)) {
    return false;
  }
  if (mode === "throw") {
    throw new TypeError(`Refusing to ${action} dangerous key: ${key}`);
  }
  return true;
}

export function setOverlayPathValue(
  target: Record<string, unknown>,
  segments: string[],
  value: unknown,
  options?: { dangerousKeyMode?: "throw" | "ignore" },
): void {
  const dangerousKeyMode = options?.dangerousKeyMode ?? "ignore";
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (handleDangerousKey(key, dangerousKeyMode, "traverse")) {
      return;
    }
    const child = Object.hasOwn(cursor, key) ? cursor[key] : undefined;
    if (!isRecord(child)) {
      const next: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      cursor[key] = next;
      cursor = next;
      continue;
    }
    cursor = child;
  }

  const leafKey = segments.at(-1)!;
  if (handleDangerousKey(leafKey, dangerousKeyMode, "set")) {
    return;
  }
  cursor[leafKey] = value;
}

export function removeOverlayPathValue(
  target: Record<string, unknown>,
  segments: string[],
  options?: { dangerousKeyMode?: "throw" | "ignore" },
): boolean {
  if (segments.length === 0) {
    return false;
  }

  const dangerousKeyMode = options?.dangerousKeyMode ?? "ignore";
  const [head, ...tail] = segments;
  if (handleDangerousKey(head, dangerousKeyMode, "traverse")) {
    return false;
  }
  if (tail.length === 0) {
    if (!Object.hasOwn(target, head)) {
      return false;
    }
    delete target[head];
    return true;
  }

  const child = Object.hasOwn(target, head) ? target[head] : undefined;
  if (!isRecord(child)) {
    return false;
  }

  const removed = removeOverlayPathValue(child, tail, options);
  if (removed && Object.keys(child).length === 0) {
    delete target[head];
  }
  return removed;
}
