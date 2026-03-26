import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { resolveConfigString, resolvePathConfigString } from "../../src/config/resolvers.js";

describe("property: resolveConfigString", () => {
  it("always returns a string", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (value) => {
          expect(typeof resolveConfigString(value)).toBe("string");
        },
      ),
    );
  });

  it("is idempotent for literal strings without env markers", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.startsWith("$") && !s.startsWith("~") && !s.includes("$TMPDIR")),
        (value) => {
          const once = resolveConfigString(value);
          const twice = resolveConfigString(once);
          expect(twice).toBe(once);
        },
      ),
    );
  });

  it("output never contains $SECRET: markers when all secrets are provided", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\$SECRET:[\w.-]+$/), fc.string({ minLength: 1 }), (secretRef, secretValue) => {
        const secretName = secretRef.slice("$SECRET:".length);
        const resolver = (name: string) => (name === secretName ? secretValue : undefined);
        const result = resolveConfigString(secretRef, resolver);
        expect(result).not.toContain("$SECRET:");
      }),
    );
  });

  it("returns the literal for strings that are not env/secret references", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.startsWith("$") && !s.startsWith("~") && !s.includes("$TMPDIR")),
        (value) => {
          expect(resolveConfigString(value)).toBe(value);
        },
      ),
    );
  });

  it("returns empty string for non-string inputs", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)), (value) => {
        expect(resolveConfigString(value)).toBe("");
      }),
    );
  });
});

describe("property: resolvePathConfigString", () => {
  it("always returns a string", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (value) => {
          expect(typeof resolvePathConfigString(value)).toBe("string");
        },
      ),
    );
  });

  it("returns empty string for non-string inputs", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)), (value) => {
        expect(resolvePathConfigString(value)).toBe("");
      }),
    );
  });

  it("output contains no unresolved $VAR patterns when env vars are set", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.stringMatching(/^[A-Za-z_]\w{0,10}$/), fc.stringMatching(/^\w{1,20}$/)),
        ([envName, envValue]) => {
          const original = process.env[envName];
          try {
            process.env[envName] = envValue;
            const input = `/$${envName}/subpath`;
            const result = resolvePathConfigString(input);
            expect(result).not.toContain(`$${envName}`);
          } finally {
            if (original === undefined) {
              delete process.env[envName];
            } else {
              process.env[envName] = original;
            }
          }
        },
      ),
    );
  });
});
