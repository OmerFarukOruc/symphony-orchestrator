import { describe, expect, it } from "vitest";
import { redactSensitiveValue, sanitizeContent } from "../../src/core/content-sanitizer.js";

describe("sanitizeContent", () => {
  it("passes clean content through unchanged", () => {
    expect(sanitizeContent("hello world")).toBe("hello world");
    expect(sanitizeContent("just some normal text with no secrets")).toBe("just some normal text with no secrets");
    expect(sanitizeContent(null)).toBeNull();
    expect(sanitizeContent(undefined)).toBeNull();
  });

  describe("truncation", () => {
    it("truncates at the exact boundary", () => {
      const longText = "a".repeat(2000);
      expect(sanitizeContent(longText)).toBe(longText);

      const tooLongText = "a".repeat(2001);
      const result = sanitizeContent(tooLongText);
      expect(result).toBe("a".repeat(2000) + "\n…[truncated, 1 more chars]");
    });

    it("truncates diffs at 500 chars", () => {
      const diffText = "a".repeat(501);
      const result = sanitizeContent(diffText, { isDiff: true });
      expect(result).toBe("a".repeat(500) + "\n…[diff truncated, 1 more chars]");
    });
  });

  describe("regex redaction", () => {
    it("redacts Linear API keys", () => {
      expect(sanitizeContent("key: lin_api_12345ABCDEfghijLMNOP")).toBe("key: [REDACTED]");
    });

    it("redacts generic sk- keys", () => {
      expect(sanitizeContent("token: sk-1234567890abcdef1234567890abcdef")).toBe("token: [REDACTED]");
      // Should not redact short words starting with sk-
      expect(sanitizeContent("skill: sk-learn")).toBe("skill: sk-learn");
    });

    it("redacts Bearer tokens", () => {
      expect(sanitizeContent("Authorization: Bearer my-secret-token-123")).toBe("Authorization: [REDACTED]");
      expect(sanitizeContent("header: bearer some.jwt.token")).toBe("header: [REDACTED]");
    });

    it("redacts GitHub tokens", () => {
      expect(sanitizeContent("ghp_1234567890abcdef1234567890abcdef1234")).toBe("[REDACTED]");
    });

    it("redacts AWS keys", () => {
      expect(sanitizeContent("aws: AKIAIOSFODNN7EXAMPLE")).toBe("aws: [REDACTED]");
    });

    it("redacts Slack tokens", () => {
      expect(sanitizeContent("slack: xoxb-1234567890-1234567890-abcdef")).toBe("slack: [REDACTED]");
    });

    it("redacts credential-bearing URLs", () => {
      expect(sanitizeContent("https://user:password@example.com/webhook")).toBe(
        "https://[REDACTED]@example.com/webhook",
      );
    });

    it("handles multiline string redaction", () => {
      const output = `stdout:
Connecting to service...
Authorization: Bearer secret-token-xyz
Data loaded.
key=lin_api_secret123
Done.`;

      const expected = `stdout:
Connecting to service...
Authorization: [REDACTED]
Data loaded.
key=[REDACTED]
Done.`;
      expect(sanitizeContent(output)).toBe(expected);
    });
  });

  describe("structural JSON redaction", () => {
    it("redacts secret keys in a flat JSON object", () => {
      const json = JSON.stringify({
        name: "test",
        password: "my-super-secret-password",
        token: "12345",
        API_KEY: "secret",
      });
      const expected = JSON.stringify(
        {
          name: "test",
          password: "[REDACTED]",
          token: "[REDACTED]",
          API_KEY: "[REDACTED]",
        },
        null,
        2,
      ); // The sanitizer formats the output with 2 spaces

      expect(sanitizeContent(json)).toBe(expected);
    });

    it("redacts secret keys in a nested JSON object", () => {
      const json = JSON.stringify({
        query: "test",
        variables: {
          auth: {
            credential: "password123",
          },
          public: "data",
        },
      });
      const expected = JSON.stringify(
        {
          query: "test",
          variables: {
            auth: {
              credential: "[REDACTED]",
            },
            public: "data",
          },
        },
        null,
        2,
      );

      expect(sanitizeContent(json)).toBe(expected);
    });

    it("redacts secret-looking string values even under benign keys", () => {
      const json = JSON.stringify({
        callback_url: "https://user:password@example.com/webhook",
        headers: {
          Authorization: "Bearer top-secret-value",
        },
      });
      const expected = JSON.stringify(
        {
          callback_url: "https://[REDACTED]@example.com/webhook",
          headers: {
            Authorization: "[REDACTED]",
          },
        },
        null,
        2,
      );

      expect(sanitizeContent(json)).toBe(expected);
    });

    it("redacts secret keys in a JSON array", () => {
      const json = JSON.stringify([
        { id: 1, secret: "abc" },
        { id: 2, secret: "def" },
      ]);
      const expected = JSON.stringify(
        [
          { id: 1, secret: "[REDACTED]" },
          { id: 2, secret: "[REDACTED]" },
        ],
        null,
        2,
      );

      expect(sanitizeContent(json)).toBe(expected);
    });

    it("redacts non-string secret values as [REDACTED_OBJECT] or [REDACTED]", () => {
      const json = JSON.stringify({
        secretObj: { a: 1 },
        secretNum: 42,
        secretBool: true,
      });
      const expected = JSON.stringify(
        {
          secretObj: { a: "[REDACTED]" },
          secretNum: "[REDACTED]",
          secretBool: "[REDACTED]",
        },
        null,
        2,
      );

      expect(sanitizeContent(json)).toBe(expected);
    });
  });

  describe("clone fallback behavior", () => {
    it("does not attempt JSON parsing for plain text with braces", () => {
      expect(sanitizeContent("stdout {not-json} tail")).toBe("stdout {not-json} tail");
    });

    it("redacts non-cloneable object values without throwing", () => {
      const value = {
        password: "secret",
        callback: () => "noop",
      };

      expect(redactSensitiveValue(value)).toEqual({
        password: "[REDACTED]",
        callback: "[REDACTED_OBJECT]",
      });
    });
  });

  describe("redactSensitiveValue — exhaustive type branches", () => {
    it("returns arrays with each element redacted recursively", () => {
      const result = redactSensitiveValue(["clean", "lin_api_secret123", 42]);
      expect(result).toEqual(["clean", "[REDACTED]", 42]);
    });

    it("preserves numbers", () => {
      expect(redactSensitiveValue(42)).toBe(42);
    });

    it("preserves booleans", () => {
      expect(redactSensitiveValue(true)).toBe(true);
      expect(redactSensitiveValue(false)).toBe(false);
    });

    it("preserves null", () => {
      expect(redactSensitiveValue(null)).toBeNull();
    });

    it("redacts strings containing secret patterns", () => {
      expect(redactSensitiveValue("prefix lin_api_abc123 suffix")).toBe("prefix [REDACTED] suffix");
    });

    it("passes clean strings through unchanged", () => {
      expect(redactSensitiveValue("hello world")).toBe("hello world");
    });

    it("returns undefined as-is for non-object/non-string", () => {
      expect(redactSensitiveValue(undefined)).toBeUndefined();
    });

    it("converts bigint to string via cloneValueFallback", () => {
      // Include a function to force the fallback path (structuredClone can't handle functions)
      const obj = { data: BigInt(42), fn: () => {} };
      const result = redactSensitiveValue(obj) as Record<string, unknown>;
      expect(result.data).toBe("42");
      expect(result.fn).toBe("[REDACTED_OBJECT]");
    });

    it("converts symbol to string via cloneValueFallback", () => {
      const sym = Symbol("test");
      // Include a function to force the fallback path
      const obj = { data: sym, fn: () => {} };
      const result = redactSensitiveValue(obj) as Record<string, unknown>;
      expect(result.data).toBe("Symbol(test)");
    });

    it("handles circular references with REDACTED_OBJECT via cloneValueFallback", () => {
      // Include a function to prevent structuredClone from working,
      // which forces the cloneValueFallback path
      const circular: Record<string, unknown> = { name: "root", fn: () => {} };
      circular.self = circular;
      const result = redactSensitiveValue(circular) as Record<string, unknown>;
      expect(result.name).toBe("root");
      expect(result.fn).toBe("[REDACTED_OBJECT]");
      expect(result.self).toBe("[REDACTED_OBJECT]");
    });

    it("functions at the top level pass through cloneAndRedactValue non-object branch", () => {
      const fn = () => {};
      // typeof fn is "function", not "object" and not string/number/boolean/null
      // So it hits the `if (typeof value !== "object" || value === undefined)` branch
      // and returns the value as-is
      const result = redactSensitiveValue(fn);
      expect(result).toBe(fn);
    });

    it("redacts secret key with array value as REDACTED_OBJECT", () => {
      const result = redactSensitiveValue({ secret: [1, 2, 3] }) as Record<string, unknown>;
      expect(result.secret).toBe("[REDACTED_OBJECT]");
    });

    it("redacts all sub-keys when secret key has object value", () => {
      const result = redactSensitiveValue({ auth: { user: "foo", pass: "bar" } }) as Record<string, unknown>;
      const authObj = result.auth as Record<string, unknown>;
      expect(authObj.user).toBe("[REDACTED]");
      expect(authObj.pass).toBe("[REDACTED]");
    });

    it("redacts secret key with non-string/non-object value as REDACTED_OBJECT", () => {
      // The else branch: value is neither string/number/boolean nor object/array
      // In practice undefined falls here
      const obj = { secret: undefined as unknown };
      const result = redactSensitiveValue(obj) as Record<string, unknown>;
      expect(result.secret).toBe("[REDACTED_OBJECT]");
    });

    it("redacts string values in arrays that contain secret patterns", () => {
      const result = redactSensitiveValue(["clean text", "lin_api_supersecret123"]) as unknown[];
      expect(result[0]).toBe("clean text");
      expect(result[1]).toBe("[REDACTED]");
    });

    it("recurses into nested objects inside arrays", () => {
      const result = redactSensitiveValue([{ password: "secret" }]) as unknown[];
      expect(result[0]).toEqual({ password: "[REDACTED]" });
    });

    it("redacts nested string values matching secret patterns under benign keys", () => {
      const result = redactSensitiveValue({ info: "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ" }) as Record<string, unknown>;
      expect(result.info).toBe("[REDACTED]");
    });

    it("recurses into nested objects under non-sensitive keys", () => {
      const result = redactSensitiveValue({
        data: { nested: { password: "xyz" } },
      }) as Record<string, unknown>;
      expect((result.data as Record<string, unknown>).nested).toEqual({ password: "[REDACTED]" });
    });
  });

  describe("sanitizeContent — truncation edge cases", () => {
    it("uses default maxLength of 2000 when no options are provided", () => {
      const exactly2000 = "x".repeat(2000);
      expect(sanitizeContent(exactly2000)).toBe(exactly2000);

      const over2000 = "x".repeat(2001);
      const result = sanitizeContent(over2000);
      expect(result).toContain("truncated");
      expect(result!.startsWith("x".repeat(2000))).toBe(true);
    });

    it("uses custom maxLength when provided without isDiff", () => {
      const text = "a".repeat(100);
      expect(sanitizeContent(text, { maxLength: 50 })).toContain("truncated");
      expect(sanitizeContent(text, { maxLength: 50 })!.startsWith("a".repeat(50))).toBe(true);
    });

    it("defaults isDiff maxLength to 500 when isDiff is true and no maxLength given", () => {
      const exactly500 = "b".repeat(500);
      expect(sanitizeContent(exactly500, { isDiff: true })).toBe(exactly500);

      const over500 = "b".repeat(501);
      const result = sanitizeContent(over500, { isDiff: true });
      expect(result).toContain("diff truncated");
    });

    it("uses explicit maxLength even when isDiff is true", () => {
      const text = "c".repeat(200);
      const result = sanitizeContent(text, { isDiff: true, maxLength: 100 });
      expect(result).toContain("diff truncated");
      expect(result!.startsWith("c".repeat(100))).toBe(true);
    });

    it("truncation suffix includes the exact remaining character count", () => {
      const text = "d".repeat(2010);
      const result = sanitizeContent(text)!;
      expect(result).toContain("10 more chars");
    });

    it("diff truncation suffix includes the exact remaining character count", () => {
      const text = "e".repeat(520);
      const result = sanitizeContent(text, { isDiff: true })!;
      expect(result).toContain("20 more chars");
    });

    it("text at exactly maxLength is not truncated", () => {
      const text = "f".repeat(300);
      expect(sanitizeContent(text, { maxLength: 300 })).toBe(text);
    });
  });

  describe("sanitizeContent — JSON structured redaction", () => {
    it("redacts valid JSON object strings with sensitive keys", () => {
      const json = JSON.stringify({ token: "mytoken123" });
      const result = sanitizeContent(json)!;
      const parsed = JSON.parse(result);
      expect(parsed.token).toBe("[REDACTED]");
    });

    it("redacts valid JSON array strings with sensitive keys", () => {
      const json = JSON.stringify([{ password: "pw123" }]);
      const result = sanitizeContent(json)!;
      const parsed = JSON.parse(result);
      expect(parsed[0].password).toBe("[REDACTED]");
    });

    it("does not attempt JSON parsing for text not starting with { or [", () => {
      const text = "just a plain string with token: value";
      const result = sanitizeContent(text)!;
      // The result still has inline redaction, not JSON formatting
      expect(result).toContain("[REDACTED]");
      expect(() => JSON.parse(result)).toThrow();
    });

    it("does not redact invalid JSON even if it starts with { and ends with }", () => {
      const text = "{not valid json at all}";
      expect(sanitizeContent(text)).toBe("{not valid json at all}");
    });

    it("returns text as-is when JSON.parse returns a non-object", () => {
      // JSON.parse("42") returns a number, not an object
      const text = "42";
      // Does not start with { or [, so not attempted
      expect(sanitizeContent(text)).toBe("42");
    });

    it("handles JSON with whitespace around the braces", () => {
      const json = `  {"secret": "value123"}  `;
      const result = sanitizeContent(json)!;
      const parsed = JSON.parse(result);
      expect(parsed.secret).toBe("[REDACTED]");
    });
  });

  describe("redactSecretPatterns — inline pattern coverage", () => {
    it("redacts token=value patterns (keeps key= prefix)", () => {
      const result = sanitizeContent("data token=mySecretValue")!;
      expect(result).toContain("token=");
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("mySecretValue");
    });

    it("redacts api_key=value patterns (keeps key= prefix)", () => {
      const result = sanitizeContent("config api_key=ABC123XYZ")!;
      expect(result).toContain("api_key=");
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("ABC123XYZ");
    });

    it("redacts api-key=value patterns (keeps key= prefix)", () => {
      const result = sanitizeContent("set api-key=ABC123XYZ")!;
      expect(result).toContain("api-key=");
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("ABC123XYZ");
    });

    it("redacts password:value patterns (keeps key: prefix)", () => {
      const result = sanitizeContent("password:hunter2")!;
      expect(result).toContain("password:");
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("hunter2");
    });

    it("redacts secret='quoted' patterns (keeps key= and quote prefix)", () => {
      const result = sanitizeContent("export secret='myval'")!;
      expect(result).toContain("secret=");
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("myval");
    });

    it("redacts authorization=value patterns (keeps key= prefix)", () => {
      const result = sanitizeContent("authorization=Bearer_XYZ")!;
      expect(result).toContain("authorization=");
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("Bearer_XYZ");
    });

    it("redacts credential URL with port", () => {
      expect(sanitizeContent("http://admin:pass@db.local:5432/mydb")).toBe("http://[REDACTED]@db.local:5432/mydb");
    });

    it("does not redact Bearer null or Bearer undefined", () => {
      expect(sanitizeContent("Bearer null")).toBe("Bearer null");
      expect(sanitizeContent("Bearer undefined")).toBe("Bearer undefined");
    });

    it("redacts xoxp Slack tokens", () => {
      expect(sanitizeContent("slack: xoxp-12345-67890")).toBe("slack: [REDACTED]");
    });

    it("redacts xoxa Slack tokens", () => {
      expect(sanitizeContent("slack: xoxa-12345-67890")).toBe("slack: [REDACTED]");
    });

    it("redacts xoxr Slack tokens", () => {
      expect(sanitizeContent("slack: xoxr-12345-67890")).toBe("slack: [REDACTED]");
    });

    it("redacts xoxs Slack tokens", () => {
      expect(sanitizeContent("slack: xoxs-12345-67890")).toBe("slack: [REDACTED]");
    });
  });

  describe("redactSensitiveValue — key matching edge cases", () => {
    it("matches key 'webhook' as sensitive", () => {
      const result = redactSensitiveValue({ webhook: "https://hook.example.com" }) as Record<string, unknown>;
      expect(result.webhook).toBe("[REDACTED]");
    });

    it("matches key 'Secret' (case-insensitive) as sensitive", () => {
      const result = redactSensitiveValue({ Secret: "abc" }) as Record<string, unknown>;
      expect(result.Secret).toBe("[REDACTED]");
    });

    it("matches key 'TOKEN' (case-insensitive) as sensitive", () => {
      const result = redactSensitiveValue({ TOKEN: "xyz" }) as Record<string, unknown>;
      expect(result.TOKEN).toBe("[REDACTED]");
    });

    it("matches key 'KEY' (case-insensitive) as sensitive", () => {
      const result = redactSensitiveValue({ KEY: "val" }) as Record<string, unknown>;
      expect(result.KEY).toBe("[REDACTED]");
    });

    it("redacts numeric values under sensitive keys", () => {
      const result = redactSensitiveValue({ secret: 12345 }) as Record<string, unknown>;
      expect(result.secret).toBe("[REDACTED]");
    });

    it("redacts boolean values under sensitive keys", () => {
      const result = redactSensitiveValue({ secret: true }) as Record<string, unknown>;
      expect(result.secret).toBe("[REDACTED]");
    });
  });
});
