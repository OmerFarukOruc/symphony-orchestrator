import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { lookupModelPrice, computeAttemptCostUsd, getAvailableModelIds } from "../../src/core/model-pricing.js";

const knownModelIds = getAvailableModelIds();

/** Strings that are NOT own keys of the PRICES table — excludes both known model IDs and Object.prototype keys. */
const prototypeKeys = new Set(Object.getOwnPropertyNames(Object.prototype));
const unknownModelArb = fc.string().filter((str) => !knownModelIds.includes(str) && !prototypeKeys.has(str));

describe("property: lookupModelPrice", () => {
  it("known models always return non-null with positive input and output prices", () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownModelIds), (modelId) => {
        const price = lookupModelPrice(modelId);
        expect(price).not.toBeNull();
        expect(price!.inputUsd).toBeGreaterThan(0);
        expect(price!.outputUsd).toBeGreaterThan(0);
      }),
    );
  });

  it("output price is always >= input price for every known model", () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownModelIds), (modelId) => {
        const price = lookupModelPrice(modelId);
        expect(price!.outputUsd).toBeGreaterThanOrEqual(price!.inputUsd);
      }),
    );
  });

  it("arbitrary strings return null", () => {
    fc.assert(
      fc.property(unknownModelArb, (unknownModel) => {
        expect(lookupModelPrice(unknownModel)).toBeNull();
      }),
    );
  });
});

describe("property: getAvailableModelIds", () => {
  it("contains no duplicate entries", () => {
    const ids = getAvailableModelIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every ID is a non-empty string", () => {
    for (const id of getAvailableModelIds()) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });
});

describe("property: computeAttemptCostUsd", () => {
  it("returns a non-negative cost for known models with non-negative token counts", () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownModelIds), fc.nat(), fc.nat(), (model, inputTokens, outputTokens) => {
        const cost = computeAttemptCostUsd({ model, tokenUsage: { inputTokens, outputTokens } });
        expect(cost).not.toBeNull();
        expect(cost!).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("returns null when tokenUsage is null regardless of model", () => {
    fc.assert(
      fc.property(fc.string(), (model) => {
        expect(computeAttemptCostUsd({ model, tokenUsage: null })).toBeNull();
      }),
    );
  });

  it("returns null for unknown models even with valid token usage", () => {
    fc.assert(
      fc.property(unknownModelArb, fc.nat(), fc.nat(), (model, inputTokens, outputTokens) => {
        expect(computeAttemptCostUsd({ model, tokenUsage: { inputTokens, outputTokens } })).toBeNull();
      }),
    );
  });

  it("cost scales linearly — doubling tokens doubles the cost", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...knownModelIds),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (model, inputTokens, outputTokens) => {
          const base = computeAttemptCostUsd({ model, tokenUsage: { inputTokens, outputTokens } })!;
          const doubled = computeAttemptCostUsd({
            model,
            tokenUsage: { inputTokens: inputTokens * 2, outputTokens: outputTokens * 2 },
          })!;
          expect(doubled).toBeCloseTo(base * 2, 10);
        },
      ),
    );
  });

  it("cost is zero when both token counts are zero", () => {
    fc.assert(
      fc.property(fc.constantFrom(...knownModelIds), (model) => {
        const cost = computeAttemptCostUsd({ model, tokenUsage: { inputTokens: 0, outputTokens: 0 } });
        expect(cost).toBe(0);
      }),
    );
  });
});
