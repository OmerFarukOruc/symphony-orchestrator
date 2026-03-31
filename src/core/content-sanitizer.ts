const REDACTION = "[REDACTED]";
const REDACTED_OBJECT = "[REDACTED_OBJECT]";
const REDACT_KEYS = /secret|token|key|password|credential|authorization|auth|webhook/i;
const SECRET_PATTERNS = [
  /lin_api_\w+/g,
  /sk-\w{20,}/g,
  /Bearer\s+(?!null|undefined)[\w.~+/-]+=*/gi,
  /ghp_\w{36}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[baprs]-[0-9a-zA-Z-]+/g,
  /(?:token|api[_-]?key|secret|password|authorization)[:=]\s?["']?[^"'\s,}]+/gi,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/gi,
];

function redactSecretPatterns(text: string): string {
  let processed = text;
  for (const pattern of SECRET_PATTERNS) {
    processed = processed.replaceAll(pattern, (match) => {
      if (/^https?:\/\//i.test(match)) {
        return match.replace(/\/\/[^/\s:@]+:[^/\s@]+@/i, `//${REDACTION}@`);
      }
      if (/[:=]/.test(match)) {
        // eslint-disable-next-line sonarjs/slow-regex -- [^\n]*$ anchored at end; safe
        return match.replace(/([:=]\s*["']?)[^\n]*$/, `$1${REDACTION}`);
      }
      return REDACTION;
    });
  }
  return processed;
}

function cloneValueFallback(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValueFallback(entry, seen));
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value === "function" || value === undefined) {
    return REDACTED_OBJECT;
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return REDACTED_OBJECT;
  }

  seen.add(value);
  const cloned: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    cloned[key] = cloneValueFallback(nestedValue, seen);
  }
  seen.delete(value);
  return cloned;
}

function cloneObjectForRedaction(value: Record<string, unknown>): Record<string, unknown> {
  try {
    return structuredClone(value) as Record<string, unknown>;
  } catch {
    const fallback = cloneValueFallback(value);
    return normalizeCloneFallbackRecord(fallback);
  }
}

function normalizeCloneFallbackRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function cloneAndRedactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneAndRedactValue(entry));
  }
  if (typeof value === "string") {
    return redactSecretPatterns(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (typeof value !== "object" || value === undefined) {
    return value;
  }

  const cloned = cloneObjectForRedaction(value as Record<string, unknown>);
  redactObjectPayload(cloned);
  return cloned;
}

export function redactSensitiveValue(value: unknown): unknown {
  return cloneAndRedactValue(value);
}

export function sanitizeContent(
  text: string | null | undefined,
  options?: { isDiff?: boolean; maxLength?: number },
): string | null {
  if (text === null || text === undefined) {
    return null;
  }

  const maxLength = options?.maxLength ?? (options?.isDiff ? 500 : 2000);
  const processed = maybeRedactStructuredJson(redactSecretPatterns(text));
  return truncateSanitizedContent(processed, maxLength, options?.isDiff === true);
}

function maybeRedactStructuredJson(text: string): string {
  const trimmed = text.trim();
  if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
    return text;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      return JSON.stringify(redactSensitiveValue(parsed), null, 2);
    }
  } catch {
    /* not valid JSON — return as-is */
  }
  return text;
}

function truncateSanitizedContent(text: string, maxLength: number, isDiff: boolean): string {
  if (text.length <= maxLength) {
    return text;
  }

  const hint = isDiff ? "diff truncated" : "truncated";
  return text.slice(0, maxLength) + `\n…[${hint}, ${text.length - maxLength} more chars]`;
}

function redactArrayItems(arr: unknown[]): void {
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    if (typeof current === "object" && current !== null) {
      redactObjectPayload(current as Record<string, unknown> | unknown[]);
    } else if (typeof current === "string") {
      arr[i] = redactSecretPatterns(current);
    }
  }
}

function redactMatchingKeyValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    obj[key] = REDACTION;
  } else if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      obj[key] = REDACTED_OBJECT;
    } else {
      for (const k of Object.keys(value as Record<string, unknown>)) {
        (value as Record<string, unknown>)[k] = REDACTION;
      }
    }
  } else {
    obj[key] = REDACTED_OBJECT;
  }
}

function redactObjectEntries(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (REDACT_KEYS.test(key)) {
      redactMatchingKeyValue(obj, key, value);
    } else if (typeof value === "object" && value !== null) {
      redactObjectPayload(value as Record<string, unknown> | unknown[]);
    } else if (typeof value === "string") {
      obj[key] = redactSecretPatterns(value);
    }
  }
}

function redactObjectPayload(obj: Record<string, unknown> | unknown[]): void {
  if (Array.isArray(obj)) {
    redactArrayItems(obj);
    return;
  }
  redactObjectEntries(obj);
}
