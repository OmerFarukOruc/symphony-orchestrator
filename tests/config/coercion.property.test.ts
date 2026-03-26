import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  asRecord,
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  asRecordArray,
  asLooseStringArray,
  asStringMap,
  asNumberMap,
} from "../../src/config/coercion.js";

/** Arbitrary that produces any JSON-compatible value. */
const anyValue = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string()),
  fc.dictionary(fc.string(), fc.string()),
);

describe("property: asRecord", () => {
  it("never throws for any input", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        expect(() => asRecord(value)).not.toThrow();
      }),
    );
  });

  it("always returns a non-null object (not array)", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = asRecord(value);
        expect(typeof result).toBe("object");
        expect(result).not.toBeNull();
        expect(Array.isArray(result)).toBe(false);
      }),
    );
  });
});

describe("property: asString", () => {
  it("always returns a string for any input", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        expect(typeof asString(value)).toBe("string");
      }),
    );
  });

  it("preserves the original string when input is already a string", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(asString(value)).toBe(value);
      }),
    );
  });

  it("returns the fallback for non-string inputs", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        fc.string(),
        (value, fallback) => {
          expect(asString(value, fallback)).toBe(fallback);
        },
      ),
    );
  });
});

describe("property: asNumber", () => {
  it("always returns a finite number or the fallback", () => {
    fc.assert(
      fc.property(anyValue, fc.integer(), (value, fallback) => {
        const result = asNumber(value, fallback);
        expect(typeof result).toBe("number");
        expect(Number.isFinite(result)).toBe(true);
      }),
    );
  });

  it("returns the input for finite numbers", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.integer(), (value, fallback) => {
        expect(asNumber(value, fallback)).toBe(value);
      }),
    );
  });

  it("returns the fallback for NaN and Infinity", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity)),
        fc.integer(),
        (value, fallback) => {
          expect(asNumber(value, fallback)).toBe(fallback);
        },
      ),
    );
  });
});

describe("property: asBoolean", () => {
  it("always returns a boolean for any input", () => {
    fc.assert(
      fc.property(anyValue, fc.boolean(), (value, fallback) => {
        expect(typeof asBoolean(value, fallback)).toBe("boolean");
      }),
    );
  });

  it("preserves original boolean when input is boolean", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (value, fallback) => {
        expect(asBoolean(value, fallback)).toBe(value);
      }),
    );
  });
});

describe("property: asStringArray", () => {
  it("always returns an array for any input", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = asStringArray(value, []);
        expect(Array.isArray(result)).toBe(true);
      }),
    );
  });

  it("every element in the result is a non-empty string", () => {
    fc.assert(
      fc.property(fc.array(anyValue), (value) => {
        const result = asStringArray(value, []);
        for (const item of result) {
          expect(typeof item).toBe("string");
          expect(item.trim().length).toBeGreaterThan(0);
        }
      }),
    );
  });
});

describe("property: asRecordArray", () => {
  it("always returns an array of plain objects", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = asRecordArray(value);
        expect(Array.isArray(result)).toBe(true);
        for (const item of result) {
          expect(typeof item).toBe("object");
          expect(item).not.toBeNull();
          expect(Array.isArray(item)).toBe(false);
        }
      }),
    );
  });
});

describe("property: asLooseStringArray", () => {
  it("always returns an array of strings (including empty)", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = asLooseStringArray(value);
        expect(Array.isArray(result)).toBe(true);
        for (const item of result) {
          expect(typeof item).toBe("string");
        }
      }),
    );
  });
});

describe("property: asStringMap", () => {
  it("always returns a Record with all string values", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = asStringMap(value);
        expect(typeof result).toBe("object");
        expect(result).not.toBeNull();
        for (const val of Object.values(result)) {
          expect(typeof val).toBe("string");
        }
      }),
    );
  });
});

describe("property: asNumberMap", () => {
  it("always returns a Record with all finite number values", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = asNumberMap(value);
        expect(typeof result).toBe("object");
        expect(result).not.toBeNull();
        for (const val of Object.values(result)) {
          expect(typeof val).toBe("number");
          expect(Number.isFinite(val)).toBe(true);
        }
      }),
    );
  });
});
