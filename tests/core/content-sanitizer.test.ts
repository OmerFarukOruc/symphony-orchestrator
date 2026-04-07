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
    it("fully redacts standalone secrets without leaking trailing fragments", () => {
      const cases = [
        ["lin_api_12345ABCDEfghijLMNOP", "[REDACTED]"],
        ["prefix lin_api_12345ABCDEfghijLMNOP suffix", "prefix [REDACTED] suffix"],
        ["sk-1234567890abcdef1234567890abcdef", "[REDACTED]"],
        ["Bearer my-secret-token-123", "[REDACTED]"],
        ["bearer some.jwt.token", "[REDACTED]"],
        ["ghp_1234567890abcdef1234567890abcdef1234", "[REDACTED]"],
        ["AKIAIOSFODNN7EXAMPLE", "[REDACTED]"],
        ["xoxp-1234567890-1234567890-abcdef", "[REDACTED]"],
      ] as const;

      for (const [input, expected] of cases) {
        expect(sanitizeContent(input)).toBe(expected);
      }
    });

    it("redacts Linear API keys", () => {
      expect(sanitizeContent("key: lin_api_12345ABCDEfghijLMNOP")).toBe("key: [REDACTED]");
      expect(sanitizeContent("lin_api_abcd_1234")).toBe("[REDACTED]");
    });

    it("does not redact incomplete or malformed Linear API prefixes", () => {
      expect(sanitizeContent("lin_api_")).toBe("lin_api_");
      expect(sanitizeContent("lin_api_-suffix")).toBe("lin_api_-suffix");
      expect(sanitizeContent("LIN_API_12345ABCDEfghijLMNOP")).toBe("LIN_API_12345ABCDEfghijLMNOP");
    });

    it("redacts generic sk- keys", () => {
      expect(sanitizeContent("token: sk-1234567890abcdef1234567890abcdef")).toBe("token: [REDACTED]");
      expect(sanitizeContent("sk-1234567890abcdef1234")).toBe("[REDACTED]");
      // Should not redact short words starting with sk-
      expect(sanitizeContent("skill: sk-learn")).toBe("skill: sk-learn");
      expect(sanitizeContent("sk-1234567890123456789")).toBe("sk-1234567890123456789");
      expect(sanitizeContent("SK-12345678901234567890")).toBe("SK-12345678901234567890");
    });

    it("redacts Bearer tokens", () => {
      expect(sanitizeContent("Authorization: Bearer my-secret-token-123")).toBe("Authorization: [REDACTED]");
      expect(sanitizeContent("header: bearer some.jwt.token")).toBe("header: [REDACTED]");
      expect(sanitizeContent("Authorization: Bearer token==")).toBe("Authorization: [REDACTED]");
      expect(sanitizeContent("Bearer some.jwt.token==")).toBe("[REDACTED]");
      expect(sanitizeContent("Authorization: Bearer\tspaced-token")).toBe("Authorization: [REDACTED]");
    });

    it("does not redact incomplete or excluded Bearer prefixes", () => {
      expect(sanitizeContent("Bearer null")).toBe("Bearer null");
      expect(sanitizeContent("Bearer undefined")).toBe("Bearer undefined");
      expect(sanitizeContent("Bearer null-token")).toBe("[REDACTED]");
      expect(sanitizeContent("Bearer undefined-token")).toBe("[REDACTED]");
      expect(sanitizeContent("Bearer")).toBe("Bearer");
      expect(sanitizeContent("BearerToken abc")).toBe("BearerToken abc");
      expect(sanitizeContent("Bearer !!!")).toBe("Bearer !!!");
    });

    it("redacts GitHub tokens", () => {
      expect(sanitizeContent("ghp_1234567890abcdef1234567890abcdef1234")).toBe("[REDACTED]");
      expect(sanitizeContent(`ghp_${"a".repeat(35)}`)).toBe(`ghp_${"a".repeat(35)}`);
      expect(sanitizeContent("GHP_1234567890abcdef1234567890abcdef1234")).toBe(
        "GHP_1234567890abcdef1234567890abcdef1234",
      );
    });

    it("redacts AWS keys", () => {
      expect(sanitizeContent("aws: AKIAIOSFODNN7EXAMPLE")).toBe("aws: [REDACTED]");
      expect(sanitizeContent("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED]");
      expect(sanitizeContent("AKIA123")).toBe("AKIA123");
      expect(sanitizeContent("akiaIOSFODNN7EXAMPLE")).toBe("akiaIOSFODNN7EXAMPLE");
    });

    it("redacts Slack tokens", () => {
      expect(sanitizeContent("slack: xoxb-1234567890-1234567890-abcdef")).toBe("slack: [REDACTED]");
      expect(sanitizeContent("xoxp-1234567890-1234567890-abcdef")).toBe("[REDACTED]");
      expect(sanitizeContent("xoxz-1234567890-1234567890-abcdef")).toBe("xoxz-1234567890-1234567890-abcdef");
      expect(sanitizeContent("zzzb-1234567890-1234567890-abcdef")).toBe("zzzb-1234567890-1234567890-abcdef");
      expect(sanitizeContent("xoxb_1234567890-1234567890-abcdef")).toBe("xoxb_1234567890-1234567890-abcdef");
      expect(sanitizeContent("xoxb-")).toBe("xoxb-");
      expect(sanitizeContent("xoxb-.abcdef")).toBe("xoxb-.abcdef");
    });

    it("redacts credential-bearing URLs", () => {
      expect(sanitizeContent("https://user:password@example.com/webhook")).toBe(
        "https://[REDACTED]@example.com/webhook",
      );
      expect(sanitizeContent("http://user:password@example.com/webhook")).toBe("http://[REDACTED]@example.com/webhook");
      expect(sanitizeContent("see http://user:password@example.com/webhook now")).toBe(
        "see http://[REDACTED]@example.com/webhook now",
      );
      expect(sanitizeContent("https://user@example.com/webhook")).toBe("https://user@example.com/webhook");
      expect(sanitizeContent("https://:password@example.com/webhook")).toBe("https://:password@example.com/webhook");
      expect(sanitizeContent("https://user:@example.com/webhook")).toBe("https://user:@example.com/webhook");
      expect(sanitizeContent("ftp://user:password@example.com/webhook")).toBe(
        "ftp://user:password@example.com/webhook",
      );
      expect(sanitizeContent("xuser:password@example.com/webhook")).toBe("xuser:password@example.com/webhook");
      expect(sanitizeContent("https://user.name:pass-word@example.com/webhook")).toBe(
        "https://[REDACTED]@example.com/webhook",
      );
      expect(sanitizeContent("https://user-name:pass.word@example.com/webhook")).toBe(
        "https://[REDACTED]@example.com/webhook",
      );
      expect(sanitizeContent("https://user name:password@example.com/webhook")).toBe(
        "https://user name:password@example.com/webhook",
      );
      expect(sanitizeContent("https://user:pass word@example.com/webhook")).toBe(
        "https://user:pass word@example.com/webhook",
      );
      expect(sanitizeContent("https://user:pass/path@example.com/webhook")).toBe(
        "https://user:pass/path@example.com/webhook",
      );
    });

    it("redacts generic credential assignments for api key aliases and separator variants", () => {
      expect(sanitizeContent("apikey: abc123 done")).toBe("apikey: [REDACTED] done");
      expect(sanitizeContent("api_key: abc123 done")).toBe("api_key: [REDACTED] done");
      expect(sanitizeContent("api-key: abc123 done")).toBe("api-key: [REDACTED] done");
      expect(sanitizeContent("token=abc123 done")).toBe("token=[REDACTED] done");
      expect(sanitizeContent("token:\tabc123 tail")).toBe("token:\t[REDACTED] tail");
      expect(sanitizeContent("token:\nabc123 tail")).toBe("token:\n[REDACTED] tail");
      expect(sanitizeContent("token:\rabc123 tail")).toBe("token:\r[REDACTED] tail");
      expect(sanitizeContent("token:'abc123' tail")).toBe("token:'[REDACTED]' tail");
      expect(sanitizeContent('token:"abc123" tail')).toBe('token:"[REDACTED]" tail');
      expect(sanitizeContent("token:abc123,tail")).toBe("token:[REDACTED],tail");
      expect(sanitizeContent("token:abc123}tail")).toBe("token:[REDACTED]}tail");
      expect(sanitizeContent('password="abc123"')).toBe('password="[REDACTED]"');
    });

    it("does not redact loose words that look like keys without separators", () => {
      expect(sanitizeContent("token abc123 done")).toBe("token abc123 done");
      expect(sanitizeContent('token:"" tail')).toBe('token:"" tail');
      expect(sanitizeContent("token:'' tail")).toBe("token:'' tail");
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
    it("passes malformed JSON-like content through without reformatting", () => {
      const malformed = '{"token":"lin_api_12345ABCDEfghijLMNOP",}';

      expect(sanitizeContent(malformed)).toBe('{"token":"[REDACTED]",}');
    });

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

    it("detects and redacts whitespace-wrapped JSON objects", () => {
      const json = '  {"token":"lin_api_12345ABCDEfghijLMNOP","count":1}  ';
      const expected = JSON.stringify(
        {
          token: "[REDACTED]",
          count: 1,
        },
        null,
        2,
      );

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

    it("detects and redacts whitespace-wrapped JSON arrays", () => {
      const json = '\n [ {"secret":"abc"}, {"note":"Bearer token-123"} ] \n';
      const expected = JSON.stringify([{ secret: "[REDACTED]" }, { note: "[REDACTED]" }], null, 2);

      expect(sanitizeContent(json)).toBe(expected);
    });

    it("redacts top-level arrays while preserving non-secret primitive entries", () => {
      const value = [
        "safe",
        5,
        false,
        null,
        {
          token: "abc",
          note: "Bearer nested-token",
          nested: ["sk-1234567890abcdef1234567890abcdef"],
        },
        undefined,
      ];

      expect(redactSensitiveValue(value)).toEqual([
        "safe",
        5,
        false,
        null,
        {
          token: "[REDACTED]",
          note: "[REDACTED]",
          nested: ["[REDACTED]"],
        },
        undefined,
      ]);
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

    it("distinguishes redacted secret arrays from recursively redacted regular arrays", () => {
      const value = {
        secretArray: ["a", "b"],
        secretObject: { a: 1, b: false },
        regularArray: ["Bearer a.b.c", 7, null, { password: "pw" }],
      };

      expect(redactSensitiveValue(value)).toEqual({
        secretArray: "[REDACTED_OBJECT]",
        secretObject: { a: "[REDACTED]", b: "[REDACTED]" },
        regularArray: ["[REDACTED]", 7, null, { password: "[REDACTED]" }],
      });
    });

    it("recursively redacts secrets inside nested arrays and objects", () => {
      const value = {
        items: [
          {
            metadata: {
              notes: ["keep", "Authorization: Bearer nested-token-123"],
              apiKey: "sk-1234567890abcdef1234567890abcdef",
            },
          },
          {
            children: [{ url: "https://user:password@example.com/webhook" }],
          },
        ],
      };

      expect(redactSensitiveValue(value)).toEqual({
        items: [
          {
            metadata: {
              notes: ["keep", "Authorization: [REDACTED]"],
              apiKey: "[REDACTED]",
            },
          },
          {
            children: [{ url: "https://[REDACTED]@example.com/webhook" }],
          },
        ],
      });
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

    it("distinguishes primitive and structured secret values", () => {
      const json = JSON.stringify({
        password: "my-super-secret-password",
        apiKey: { nested: "secret", count: 1 },
        secretList: ["a", "b"],
        auth: null,
      });
      const expected = JSON.stringify(
        {
          password: "[REDACTED]",
          apiKey: { nested: "[REDACTED]", count: "[REDACTED]" },
          secretList: "[REDACTED_OBJECT]",
          auth: "[REDACTED_OBJECT]",
        },
        null,
        2,
      );

      expect(sanitizeContent(json)).toBe(expected);
    });

    it("uses the canonical redaction placeholder strings", () => {
      expect(sanitizeContent("Bearer my-secret-token-123")).toBe("[REDACTED]");
      expect(redactSensitiveValue({ password: "pw", secretList: ["a"], secretMaybe: undefined })).toEqual({
        password: "[REDACTED]",
        secretList: "[REDACTED_OBJECT]",
        secretMaybe: "[REDACTED_OBJECT]",
      });
    });

    it("redacts undefined secret values as redacted objects", () => {
      expect(redactSensitiveValue({ secretMaybe: undefined })).toEqual({
        secretMaybe: "[REDACTED_OBJECT]",
      });
    });
  });

  describe("clone fallback behavior", () => {
    it("does not attempt JSON parsing for plain text with braces", () => {
      expect(sanitizeContent("stdout {not-json} tail")).toBe("stdout {not-json} tail");
    });

    it("preserves top-level primitive and non-object values", () => {
      expect(redactSensitiveValue("safe-value")).toBe("safe-value");
      expect(redactSensitiveValue(42)).toBe(42);
      expect(redactSensitiveValue(true)).toBe(true);
      expect(redactSensitiveValue(null)).toBeNull();
      expect(redactSensitiveValue(undefined)).toBeUndefined();
      expect(redactSensitiveValue(123n)).toBe(123n);
      expect(redactSensitiveValue(Symbol.for("demo"))).toBe(Symbol.for("demo"));
      expect(redactSensitiveValue(() => "noop")).toBeTypeOf("function");
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

    it("stringifies bigint and symbol values when clone fallback is required", () => {
      const value = {
        callback: () => "noop",
        marker: Symbol.for("demo"),
        count: 123n,
      };

      expect(redactSensitiveValue(value)).toEqual({
        callback: "[REDACTED_OBJECT]",
        marker: "Symbol(demo)",
        count: "123",
      });
    });

    it("walks fallback-cloned arrays and preserves non-secret primitives exactly", () => {
      const value = {
        callback: () => "noop",
        payload: [
          "safe",
          7,
          false,
          null,
          123n,
          Symbol.for("demo"),
          undefined,
          { note: "Bearer nested-token", count: 1 },
        ],
      };

      expect(redactSensitiveValue(value)).toEqual({
        callback: "[REDACTED_OBJECT]",
        payload: ["safe", 7, false, null, "123", "Symbol(demo)", "[REDACTED_OBJECT]", { note: "[REDACTED]", count: 1 }],
      });
    });

    it("handles cyclic values when fallback cloning is required", () => {
      const nested: Record<string, unknown> = {};
      const value: Record<string, unknown> = {
        password: "secret",
        callback: () => "noop",
        nested,
      };
      nested.self = value;

      expect(redactSensitiveValue(value)).toEqual({
        password: "[REDACTED]",
        callback: "[REDACTED_OBJECT]",
        nested: {
          self: "[REDACTED_OBJECT]",
        },
      });
    });
  });
});
