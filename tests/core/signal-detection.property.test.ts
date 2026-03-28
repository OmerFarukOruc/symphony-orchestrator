import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { detectStopSignal } from "../../src/core/signal-detection.js";

/**
 * Known text markers that the detector normalizes and matches.
 * Each pair maps a marker variant to the expected stop signal.
 */
const doneMarkers = ["symphony_status: done", "symphony status: done"] as const;
const blockedMarkers = ["symphony_status: blocked", "symphony status: blocked"] as const;

/** Arbitrary that produces random surrounding noise around a marker. */
function withNoise(marker: string): fc.Arbitrary<string> {
  return fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix} ${marker} ${suffix}`);
}

/** Arbitrary that generates valid JSON with a status field. */
function jsonWithStatus(status: string): fc.Arbitrary<string> {
  return fc.record({ extra: fc.string() }).map((extra) => JSON.stringify({ status, ...extra }));
}

describe("signal detection properties", () => {
  it("property: null input yields null", () => {
    fc.assert(
      fc.property(fc.constant(null), (input) => {
        expect(detectStopSignal(input)).toBeNull();
      }),
    );
  });

  it("property: empty string yields null", () => {
    fc.assert(
      fc.property(fc.constant(""), (input) => {
        expect(detectStopSignal(input)).toBeNull();
      }),
    );
  });

  it("property: whitespace-only strings yield null", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 50 })
          .map((chars) => chars.join("")),
        (input) => {
          expect(detectStopSignal(input)).toBeNull();
        },
      ),
    );
  });

  it("property: text containing a done marker always detects 'done'", () => {
    fc.assert(
      fc.property(fc.constantFrom(...doneMarkers).chain(withNoise), (input) => {
        expect(detectStopSignal(input)).toBe("done");
      }),
    );
  });

  it("property: text containing a blocked marker always detects 'blocked'", () => {
    fc.assert(
      fc.property(fc.constantFrom(...blockedMarkers).chain(withNoise), (input) => {
        expect(detectStopSignal(input)).toBe("blocked");
      }),
    );
  });

  it("property: JSON with status DONE always detects 'done'", () => {
    fc.assert(
      fc.property(jsonWithStatus("DONE"), (input) => {
        expect(detectStopSignal(input)).toBe("done");
      }),
    );
  });

  it("property: JSON with status BLOCKED always detects 'blocked'", () => {
    fc.assert(
      fc.property(jsonWithStatus("BLOCKED"), (input) => {
        expect(detectStopSignal(input)).toBe("blocked");
      }),
    );
  });

  it("property: JSON status detection is case-insensitive", () => {
    fc.assert(
      fc.property(fc.constantFrom("done", "Done", "DONE", "dOnE").chain(jsonWithStatus), (input) => {
        expect(detectStopSignal(input)).toBe("done");
      }),
    );
  });

  it("property: result is always null, 'done', or 'blocked'", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constant(null)), (input) => {
        const result = detectStopSignal(input);
        expect(result === null || result === "done" || result === "blocked").toBe(true);
      }),
    );
  });

  it("property: random strings without known markers yield null", () => {
    const allMarkers = [...doneMarkers, ...blockedMarkers];
    fc.assert(
      fc.property(
        fc.string().filter((str) => {
          const lower = str.toLowerCase().replaceAll(/\s+/g, " ");
          return allMarkers.every((marker) => !lower.includes(marker));
        }),
        (input) => {
          // If string is not valid JSON with a status field and has no text markers, expect null
          let hasJsonStatus = false;
          try {
            const parsed: unknown = JSON.parse(input.trim());
            if (parsed && typeof parsed === "object" && "status" in parsed) {
              const status = String((parsed as Record<string, unknown>).status).toUpperCase();
              hasJsonStatus = status === "DONE" || status === "BLOCKED";
            }
          } catch {
            // Not JSON
          }
          if (!hasJsonStatus) {
            expect(detectStopSignal(input)).toBeNull();
          }
        },
      ),
    );
  });

  it("property: detection is idempotent — same input always yields same result", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constant(null)), (input) => {
        const first = detectStopSignal(input);
        const second = detectStopSignal(input);
        expect(first).toBe(second);
      }),
    );
  });
});
