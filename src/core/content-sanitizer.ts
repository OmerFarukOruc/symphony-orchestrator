export function sanitizeContent(
  text: string | null | undefined,
  options?: { isDiff?: boolean; maxLength?: number },
): string | null {
  if (text === null || text === undefined) {
    return null;
  }

  const maxLength = options?.maxLength ?? (options?.isDiff ? 500 : 2000);
  let processed = text;

  // Pattern-based redaction
  const patterns = [
    /lin_api_[A-Za-z0-9]+/g,
    /sk-[A-Za-z0-9]{20,}/g, // Generic sk- pattern
    /Bearer\s+(?!null|undefined)[A-Za-z0-9\-._~+/]+=*/gi,
    /ghp_[A-Za-z0-9]{36}/g,
    /AKIA[0-9A-Z]{16}/g,
    /xox[baprs]-[0-9a-zA-Z-]+/g, // Slack tokens
  ];

  for (const pattern of patterns) {
    processed = processed.replace(pattern, "[REDACTED]");
  }

  // Very basic JSON structural redaction if it looks like JSON
  if (processed.includes("{") && processed.includes("}")) {
    try {
      // Try to parse the whole thing (e.g. tool args)
      const parsed = JSON.parse(processed);
      if (typeof parsed === "object" && parsed !== null) {
        redactObjectPayload(parsed);
        processed = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // Not pure JSON, but might contain JSON or just be plain text.
      // We skip structural parsing and rely on regexes.
    }
  }

  // Truncation
  if (processed.length > maxLength) {
    const hint = options?.isDiff ? "diff truncated" : "truncated";
    processed = processed.slice(0, maxLength) + `\n…[${hint}, ${processed.length - maxLength} more chars]`;
  }

  return processed;
}

const REDACT_KEYS = /secret|token|key|password|credential|authorization|auth/i;

function redactObjectPayload(obj: Record<string, unknown> | unknown[]): void {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === "object" && obj[i] !== null) {
        redactObjectPayload(obj[i] as Record<string, unknown> | unknown[]);
      } else if (typeof obj[i] === "string" && REDACT_KEYS.test(String(i))) {
        // Unlikely for array indices, but covered
        obj[i] = "[REDACTED]";
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (REDACT_KEYS.test(key)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        obj[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          obj[key] = "[REDACTED_OBJECT]";
        } else {
          // It's an object with a secret key. Redact all its fields.
          for (const k of Object.keys(value as Record<string, unknown>)) {
            (value as Record<string, unknown>)[k] = "[REDACTED]";
          }
        }
      } else {
        obj[key] = "[REDACTED_OBJECT]";
      }
    } else if (typeof value === "object" && value !== null) {
      redactObjectPayload(value as Record<string, unknown> | unknown[]);
    }
  }
}
