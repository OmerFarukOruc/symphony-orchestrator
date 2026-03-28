import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { sanitizeContent, redactSensitiveValue } from "../../src/core/content-sanitizer.js";

/** Helper: build a string arbitrary from an alphabet (fc.stringOf removed in fast-check v4). */
const alphanumChars = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"];
const charsOf = (chars: string[], min: number, max: number) =>
  fc.array(fc.constantFrom(...chars), { minLength: min, maxLength: max }).map((a) => a.join(""));

/**
 * Arbitraries that embed known secret patterns into random surrounding text.
 * Each mirrors one of the SECRET_PATTERNS regexes in the source module.
 */
const linearKeyArb = charsOf(alphanumChars, 5, 30).map((suffix) => `lin_api_${suffix}`);
const skKeyArb = charsOf(alphanumChars, 20, 40).map((suffix) => `sk-${suffix}`);
const ghpTokenArb = charsOf(alphanumChars, 36, 36).map((suffix) => `ghp_${suffix}`);
const awsKeyArb = charsOf([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"], 16, 16).map((suffix) => `AKIA${suffix}`);
const slackTokenArb = charsOf([..."abcdefghijklmnopqrstuvwxyz0123456789-"], 10, 30).map((suffix) => `xoxb-${suffix}`);

const secretArb = fc.oneof(linearKeyArb, skKeyArb, ghpTokenArb, awsKeyArb, slackTokenArb);

/** Wraps a secret in random surrounding text to form a realistic input. */
const textWithSecretArb = fc.tuple(fc.string(), secretArb, fc.string()).map(([prefix, secret, suffix]) => ({
  fullText: `${prefix} ${secret} ${suffix}`,
  secret,
}));

describe("content sanitizer properties", () => {
  describe("output length bound", () => {
    it("property: sanitizeContent output never exceeds maxLength + truncation suffix", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 5000 }),
          fc.integer({ min: 1, max: 10000 }),
          (input, maxLen) => {
            const result = sanitizeContent(input, { maxLength: maxLen });
            if (result === null) return; // null/undefined passthrough is valid
            // When truncated, output = maxLen chars + a truncation suffix line.
            // The suffix format is: "\n…[truncated, N more chars]"
            // So output can exceed maxLen by the suffix length, but the content
            // portion before the suffix is always <= maxLen.
            const contentBeforeSuffix = result.includes("\n…[truncated,")
              ? result.slice(0, result.lastIndexOf("\n…[truncated,"))
              : result.includes("\n…[diff truncated,")
                ? result.slice(0, result.lastIndexOf("\n…[diff truncated,"))
                : result;
            expect(contentBeforeSuffix.length).toBeLessThanOrEqual(maxLen);
          },
        ),
      );
    });

    it("property: diff-mode output content portion never exceeds maxLength", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 5000 }),
          fc.integer({ min: 1, max: 10000 }),
          (input, maxLen) => {
            const result = sanitizeContent(input, { isDiff: true, maxLength: maxLen });
            if (result === null) return;
            const contentBeforeSuffix = result.includes("\n…[diff truncated,")
              ? result.slice(0, result.lastIndexOf("\n…[diff truncated,"))
              : result;
            expect(contentBeforeSuffix.length).toBeLessThanOrEqual(maxLen);
          },
        ),
      );
    });
  });

  describe("secret redaction", () => {
    it("property: known secret patterns never appear in sanitized output", () => {
      fc.assert(
        fc.property(textWithSecretArb, ({ fullText, secret }) => {
          const result = sanitizeContent(fullText, { maxLength: 100_000 });
          expect(result).not.toBeNull();
          expect(result!).not.toContain(secret);
        }),
      );
    });

    it("property: redactSensitiveValue removes secrets from string values", () => {
      fc.assert(
        fc.property(secretArb, (secret) => {
          const result = redactSensitiveValue(secret);
          expect(typeof result).toBe("string");
          expect(result as string).not.toContain(secret);
        }),
      );
    });

    it("property: secrets in object values under sensitive keys are redacted", () => {
      const sensitiveKeyArb = fc.constantFrom(
        "secret",
        "token",
        "password",
        "credential",
        "authorization",
        "auth_key",
        "webhook_url",
      );
      fc.assert(
        fc.property(sensitiveKeyArb, fc.string({ minLength: 1, maxLength: 50 }), (key, value) => {
          const result = redactSensitiveValue({ [key]: value }) as Record<string, unknown>;
          expect(result[key]).toBe("[REDACTED]");
        }),
      );
    });
  });

  describe("idempotency", () => {
    it("property: sanitizing already-sanitized text returns the same result", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 2000 }), (input) => {
          const once = sanitizeContent(input, { maxLength: 50_000 });
          if (once === null) return;
          const twice = sanitizeContent(once, { maxLength: 50_000 });
          expect(twice).toBe(once);
        }),
      );
    });

    it("property: sanitizing text with embedded secrets is idempotent", () => {
      fc.assert(
        fc.property(textWithSecretArb, ({ fullText }) => {
          const once = sanitizeContent(fullText, { maxLength: 100_000 });
          if (once === null) return;
          const twice = sanitizeContent(once, { maxLength: 100_000 });
          expect(twice).toBe(once);
        }),
      );
    });

    it("property: redactSensitiveValue on objects is idempotent", () => {
      const sensitiveKeyArb = fc.constantFrom("secret", "token", "password", "credential");
      fc.assert(
        fc.property(sensitiveKeyArb, fc.string({ minLength: 1, maxLength: 50 }), (key, value) => {
          const once = redactSensitiveValue({ [key]: value });
          const twice = redactSensitiveValue(once);
          expect(twice).toEqual(once);
        }),
      );
    });
  });

  describe("non-secret passthrough", () => {
    it("property: text without secret patterns is preserved as-is", () => {
      // Generate strings that cannot match any secret pattern:
      // only lowercase alphabetic + spaces, no colons/equals, no URL schemes.
      const safeCharArb = charsOf([..."abcdefghijklmnopqrstuvwxyz "], 0, 2000);
      fc.assert(
        fc.property(safeCharArb, (input) => {
          const result = sanitizeContent(input, { maxLength: 50_000 });
          if (result === null) return;
          expect(result).toBe(input);
        }),
      );
    });

    it("property: null and undefined always return null", () => {
      fc.assert(
        fc.property(fc.constantFrom(null, undefined), (input) => {
          expect(sanitizeContent(input as string | null | undefined)).toBeNull();
        }),
      );
    });

    it("property: redactSensitiveValue preserves primitives under non-sensitive keys", () => {
      const safeKeyArb = fc.constantFrom("name", "description", "count", "enabled", "label");
      const primitiveArb = fc.oneof(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
      );
      fc.assert(
        fc.property(safeKeyArb, primitiveArb, (key, value) => {
          // Only non-secret-pattern string values should pass through.
          // Numbers, booleans, null are always preserved.
          const result = redactSensitiveValue({ [key]: value }) as Record<string, unknown>;
          if (typeof value !== "string") {
            expect(result[key]).toBe(value);
          }
          // String values may still be redacted if they accidentally match
          // a secret pattern (e.g. contain "token=..."), so we only assert
          // type preservation for non-strings.
        }),
      );
    });
  });
});
