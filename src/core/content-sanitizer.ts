const REDACT_KEYS = /secret|token|key|password|credential|authorization|auth|webhook/i;
const GENERIC_SECRET_KEYS = ["api_key", "api-key", "apikey", "authorization", "password", "secret", "token"] as const;

function redaction(): string {
  return "[REDACTED]";
}

function redactedObject(): string {
  return "[REDACTED_OBJECT]";
}
function redactSecretPatterns(text: string): string {
  let processed = redactBearerTokens(text);
  processed = redactLinearApiTokens(processed);
  processed = redactSkTokens(processed);
  processed = redactSlackTokens(processed);
  processed = redactAwsAccessKeys(processed);
  processed = redactGitHubTokens(processed);
  processed = redactCredentialUrls(processed);
  return redactGenericSecretAssignments(processed);
}

function isBearerTokenChar(char: string | undefined): boolean {
  return char !== undefined && /[\w.~+/-]/.test(char);
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /\w/.test(char);
}

function redactLinearApiTokens(text: string): string {
  let index = 0;
  let redacted = "";

  while (index < text.length) {
    if (!text.startsWith("lin_api_", index)) {
      redacted += text[index];
      index += 1;
      continue;
    }

    const tokenStart = index + "lin_api_".length;
    if (!isWordChar(text[tokenStart])) {
      redacted += text[index];
      index += 1;
      continue;
    }

    let tokenEnd = tokenStart;
    while (isWordChar(text[tokenEnd])) {
      tokenEnd += 1;
    }

    redacted += redaction();
    index = tokenEnd;
  }

  return redacted;
}

function redactSkTokens(text: string): string {
  let index = 0;
  let redacted = "";

  while (index < text.length) {
    if (!text.startsWith("sk-", index)) {
      redacted += text[index];
      index += 1;
      continue;
    }

    const tokenStart = index + "sk-".length;
    let tokenEnd = tokenStart;
    while (isWordChar(text[tokenEnd])) {
      tokenEnd += 1;
    }
    if (tokenEnd - tokenStart < 20) {
      redacted += text[index];
      index += 1;
      continue;
    }

    redacted += redaction();
    index = tokenEnd;
  }

  return redacted;
}

function isSlackTokenChar(char: string | undefined): boolean {
  return char !== undefined && /[0-9A-Za-z-]/.test(char);
}

function redactSlackTokens(text: string): string {
  let index = 0;
  let redacted = "";

  while (index < text.length) {
    const tokenType = text[index + 3];
    if (!text.startsWith("xox", index) || !"baprs".includes(tokenType) || text[index + 4] !== "-") {
      redacted += text[index];
      index += 1;
      continue;
    }

    const tokenStart = index + "xoxb-".length;
    if (!isSlackTokenChar(text[tokenStart])) {
      redacted += text[index];
      index += 1;
      continue;
    }

    let tokenEnd = tokenStart;
    while (isSlackTokenChar(text[tokenEnd])) {
      tokenEnd += 1;
    }

    redacted += redaction();
    index = tokenEnd;
  }

  return redacted;
}

function isAwsAccessKeyChar(char: string | undefined): boolean {
  return char !== undefined && /[0-9A-Z]/.test(char);
}

function redactAwsAccessKeys(text: string): string {
  let index = 0;
  let redacted = "";

  while (index < text.length) {
    if (!text.startsWith("AKIA", index)) {
      redacted += text[index];
      index += 1;
      continue;
    }

    let tokenEnd = index + "AKIA".length;
    let hasFullKey = true;
    for (let offset = 0; offset < 16; offset += 1) {
      if (!isAwsAccessKeyChar(text[tokenEnd])) {
        hasFullKey = false;
        break;
      }
      tokenEnd += 1;
    }
    if (!hasFullKey) {
      redacted += text[index];
      index += 1;
      continue;
    }

    redacted += redaction();
    index = tokenEnd;
  }

  return redacted;
}

function redactGitHubTokens(text: string): string {
  let index = 0;
  let redacted = "";

  while (index < text.length) {
    if (!text.startsWith("ghp_", index)) {
      redacted += text[index];
      index += 1;
      continue;
    }

    let tokenEnd = index + "ghp_".length;
    let hasFullToken = true;
    for (let offset = 0; offset < 36; offset += 1) {
      if (!isWordChar(text[tokenEnd])) {
        hasFullToken = false;
        break;
      }
      tokenEnd += 1;
    }
    if (!hasFullToken) {
      redacted += text[index];
      index += 1;
      continue;
    }

    redacted += redaction();
    index = tokenEnd;
  }

  return redacted;
}

function isCredentialUsernameChar(char: string | undefined): boolean {
  return char !== undefined && !/[/\s:@]/.test(char);
}

function isCredentialPasswordChar(char: string | undefined): boolean {
  return char !== undefined && !/[/\s@]/.test(char);
}

function redactCredentialUrls(text: string): string {
  let index = 0;
  let redacted = "";

  while (index < text.length) {
    const schemeEnd = text.startsWith("https://", index)
      ? index + "https://".length
      : text.startsWith("http://", index)
        ? index + "http://".length
        : -1;

    let separatorIndex = schemeEnd;
    while (isCredentialUsernameChar(text[separatorIndex])) {
      separatorIndex += 1;
    }
    if (separatorIndex === schemeEnd || text[separatorIndex] !== ":") {
      redacted += text[index];
      index += 1;
      continue;
    }

    const passwordStart = separatorIndex + 1;
    let atIndex = passwordStart;
    while (isCredentialPasswordChar(text[atIndex])) {
      atIndex += 1;
    }
    if (atIndex === passwordStart || text[atIndex] !== "@") {
      redacted += text[index];
      index += 1;
      continue;
    }

    redacted += text.slice(index, schemeEnd) + `${redaction()}@`;
    index = atIndex + 1;
  }

  return redacted;
}

function redactBearerTokens(text: string): string {
  const lowerText = text.toLowerCase();
  let index = 0;
  let redacted = "";

  while (index < text.length) {
    if (!lowerText.startsWith("bearer", index)) {
      redacted += text[index];
      index += 1;
      continue;
    }

    let tokenStart = index + "bearer".length;
    let sawWhitespace = false;
    while (isAssignmentWhitespace(text[tokenStart])) {
      tokenStart += 1;
      sawWhitespace = true;
    }
    if (!sawWhitespace) {
      redacted += text[index];
      index += 1;
      continue;
    }

    let tokenEnd = tokenStart;
    while (isBearerTokenChar(text[tokenEnd])) {
      tokenEnd += 1;
    }
    const token = lowerText.slice(tokenStart, tokenEnd);
    if (token === "null" || token === "undefined") {
      redacted += text[index];
      index += 1;
      continue;
    }
    while (text[tokenEnd] === "=") {
      tokenEnd += 1;
    }
    if (tokenEnd === tokenStart) {
      redacted += text[index];
      index += 1;
      continue;
    }

    redacted += redaction();
    index = tokenEnd;
  }

  return redacted;
}

function isAssignmentWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isGenericAssignmentTerminator(char: string | undefined): boolean {
  switch (char) {
    case undefined:
    case '"':
    case "'":
    case ",":
    case "}":
      return true;
    default:
      return isAssignmentWhitespace(char);
  }
}

function redactGenericSecretAssignments(text: string): string {
  const lowerText = text.toLowerCase();
  let index = 0;
  let redacted = "";

  while (index < text.length) {
    const matchedKey = GENERIC_SECRET_KEYS.find((key) => lowerText.startsWith(key, index));
    if (!matchedKey) {
      redacted += text[index];
      index += 1;
      continue;
    }

    const separatorIndex = index + matchedKey.length;
    const separator = text[separatorIndex];
    if (separator !== ":" && separator !== "=") {
      redacted += text[index];
      index += 1;
      continue;
    }

    let valueStart = separatorIndex + 1;
    if (isAssignmentWhitespace(text[valueStart])) {
      valueStart += 1;
    }
    if (text[valueStart] === '"' || text[valueStart] === "'") {
      valueStart += 1;
    }

    let valueEnd = valueStart;
    while (!isGenericAssignmentTerminator(text[valueEnd])) {
      valueEnd += 1;
    }

    if (valueEnd === valueStart) {
      redacted += text[index];
      index += 1;
      continue;
    }

    redacted += text.slice(index, valueStart) + redaction();
    index = valueEnd;
  }

  return redacted;
}

function cloneValueFallback(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValueFallback(entry, seen));
  }
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "bigint":
    case "symbol":
      return String(value);
    case "function":
    case "undefined":
      return redactedObject();
    case "object":
      if (value === null) {
        return value;
      }
      break;
    default:
      return String(value);
  }
  if (seen.has(value)) {
    return redactedObject();
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
    return cloneValueFallback(value) as Record<string, unknown>;
  }
}

function cloneAndRedactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSecretPatterns(value);
  }
  if (typeof value !== "object" || value === null) {
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
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(redactSensitiveValue(parsed), null, 2);
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
  arr.forEach((current, i) => {
    if (typeof current === "object" && current !== null) {
      redactObjectPayload(current as Record<string, unknown> | unknown[]);
    } else if (typeof current === "string") {
      arr[i] = redactSecretPatterns(current);
    }
  });
}

function redactMatchingKeyValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    obj[key] = redaction();
  } else if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      obj[key] = redactedObject();
    } else {
      for (const k of Object.keys(value as Record<string, unknown>)) {
        (value as Record<string, unknown>)[k] = redaction();
      }
    }
  } else {
    obj[key] = redactedObject();
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
