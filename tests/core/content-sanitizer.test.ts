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
});
