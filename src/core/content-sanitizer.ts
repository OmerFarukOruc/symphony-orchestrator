const REDACTION = "[REDACTED]";
const REDACTED_OBJECT = "[REDACTED_OBJECT]";
const REDACT_KEYS = /secret|token|key|password|credential|authorization|auth|webhook/i;
const SECRET_PATTERNS = [
  /lin_api_[A-Za-z0-9]+/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /Bearer\s+(?!null|undefined)[A-Za-z0-9\-._~+/]+=*/gi,
  /ghp_[A-Za-z0-9]{36}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[baprs]-[0-9a-zA-Z-]+/g,
  /(?:token|api[_-]?key|secret|password|authorization)\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/gi,
];

function redactSecretPatterns(text: string): string {
  let processed = text;
  for (const pattern of SECRET_PATTERNS) {
    processed = processed.replace(pattern, (match) => {
      if (/^https?:\/\//i.test(match)) {
        return match.replace(/\/\/[^/\s:@]+:[^/\s@]+@/i, `//${REDACTION}@`);
      }
      if (/[:=]/.test(match)) {
        return match.replace(/([:=]\s*["']?).+$/, `$1${REDACTION}`);
      }
      return REDACTION;
    });
  }
  return processed;
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

  const cloned = structuredClone(value) as Record<string, unknown> | unknown[];
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
  let processed = redactSecretPatterns(text);

  if (processed.includes("{") && processed.includes("}")) {
    try {
      const parsed = JSON.parse(processed);
      if (typeof parsed === "object" && parsed !== null) {
        processed = JSON.stringify(redactSensitiveValue(parsed), null, 2);
      }
    } catch {
      // Fall through to plain string handling.
    }
  }

  if (processed.length > maxLength) {
    const hint = options?.isDiff ? "diff truncated" : "truncated";
    processed = processed.slice(0, maxLength) + `\n…[${hint}, ${processed.length - maxLength} more chars]`;
  }

  return processed;
}

function redactObjectPayload(obj: Record<string, unknown> | unknown[]): void {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const current = obj[i];
      if (typeof current === "object" && current !== null) {
        redactObjectPayload(current as Record<string, unknown> | unknown[]);
      } else if (typeof current === "string") {
        obj[i] = redactSecretPatterns(current);
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (REDACT_KEYS.test(key)) {
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
    } else if (typeof value === "object" && value !== null) {
      redactObjectPayload(value as Record<string, unknown> | unknown[]);
    } else if (typeof value === "string") {
      obj[key] = redactSecretPatterns(value);
    }
  }
}
