import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { normalizeIssue } from "../../src/linear/issue-parser.js";

/** Arbitrary that produces any JSON-compatible value (mirrors coercion property tests). */
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

/** Arbitrary for a PROJ-123 style identifier. */
const identifierArb = fc
  .tuple(fc.stringMatching(/^[A-Z]{2,6}$/), fc.integer({ min: 1, max: 99999 }))
  .map(([prefix, num]) => `${prefix}-${num}`);

/** Epoch ms range for 2000-01-01 to 2030-12-31 — safe for Date.toISOString(). */
const MIN_EPOCH = Date.UTC(2000, 0, 1);
const MAX_EPOCH = Date.UTC(2030, 11, 31);

/** Arbitrary that produces a valid ISO 8601 date string. */
const isoDateArb = fc.integer({ min: MIN_EPOCH, max: MAX_EPOCH }).map((ms) => new Date(ms).toISOString());

/** Arbitrary for a plausible raw Linear issue object. */
const rawIssueArb = fc.record({
  id: fc.oneof(fc.uuid(), fc.constant(undefined)),
  identifier: fc.oneof(identifierArb, fc.constant(undefined)),
  title: fc.oneof(fc.string(), fc.constant(undefined)),
  description: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
  priority: fc.oneof(fc.integer({ min: 0, max: 4 }), fc.constant(null), fc.constant(undefined)),
  branchName: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
  url: fc.oneof(fc.webUrl(), fc.constant(null), fc.constant(undefined)),
  createdAt: fc.oneof(isoDateArb, fc.constant(undefined)),
  updatedAt: fc.oneof(isoDateArb, fc.constant(undefined)),
  state: fc.oneof(fc.record({ name: fc.string() }), fc.constant(undefined)),
  labels: fc.oneof(
    fc.record({ nodes: fc.array(fc.record({ name: fc.oneof(fc.string(), fc.constant(null)) })) }),
    fc.constant(undefined),
  ),
  inverseRelations: fc.constant({ nodes: [] }),
});

describe("property: normalizeIssue — robustness", () => {
  it("never throws for completely arbitrary input", () => {
    fc.assert(
      fc.property(anyValue, (raw) => {
        expect(() => normalizeIssue(raw)).not.toThrow();
      }),
    );
  });

  it("never throws for structured issue-like input", () => {
    fc.assert(
      fc.property(rawIssueArb, (raw) => {
        expect(() => normalizeIssue(raw)).not.toThrow();
      }),
    );
  });
});

describe("property: normalizeIssue — shape invariants", () => {
  it("always returns an object with all required Issue fields", () => {
    fc.assert(
      fc.property(rawIssueArb, (raw) => {
        const issue = normalizeIssue(raw);
        expect(typeof issue.id).toBe("string");
        expect(typeof issue.identifier).toBe("string");
        expect(typeof issue.title).toBe("string");
        expect(typeof issue.state).toBe("string");
        expect(Array.isArray(issue.labels)).toBe(true);
        expect(Array.isArray(issue.blockedBy)).toBe(true);
      }),
    );
  });

  it("nullable fields are either string or null", () => {
    fc.assert(
      fc.property(rawIssueArb, (raw) => {
        const issue = normalizeIssue(raw);
        for (const field of [issue.description, issue.branchName, issue.url, issue.createdAt, issue.updatedAt]) {
          expect(field === null || typeof field === "string").toBe(true);
        }
      }),
    );
  });

  it("priority is always an integer or null", () => {
    fc.assert(
      fc.property(rawIssueArb, (raw) => {
        const issue = normalizeIssue(raw);
        if (issue.priority !== null) {
          expect(Number.isInteger(issue.priority)).toBe(true);
        }
      }),
    );
  });
});

describe("property: normalizeIssue — label normalization", () => {
  it("all labels are lowercase strings", () => {
    fc.assert(
      fc.property(rawIssueArb, (raw) => {
        const issue = normalizeIssue(raw);
        for (const label of issue.labels) {
          expect(typeof label).toBe("string");
          expect(label).toBe(label.toLowerCase());
        }
      }),
    );
  });

  it("label count never exceeds input node count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ name: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)) })),
        (nodes) => {
          const raw = {
            id: "id",
            identifier: "T-1",
            title: "title",
            state: { name: "open" },
            labels: { nodes },
            inverseRelations: { nodes: [] },
          };
          const issue = normalizeIssue(raw);
          expect(issue.labels.length).toBeLessThanOrEqual(nodes.length);
        },
      ),
    );
  });
});

describe("property: normalizeIssue — identifier round-trip", () => {
  it("PROJ-123 identifiers survive normalization unchanged", () => {
    fc.assert(
      fc.property(identifierArb, (identifier) => {
        const raw = {
          id: "some-id",
          identifier,
          title: "title",
          state: { name: "open" },
          labels: { nodes: [] },
          inverseRelations: { nodes: [] },
        };
        const issue = normalizeIssue(raw);
        expect(issue.identifier).toBe(identifier);
      }),
    );
  });
});

describe("property: normalizeIssue — fallback defaults", () => {
  it("missing id, identifier, title, and state fall back to safe defaults", () => {
    fc.assert(
      fc.property(anyValue, (garbage) => {
        const issue = normalizeIssue(garbage);
        expect(issue.id).toBe("");
        expect(issue.identifier).toBe("");
        expect(issue.title).toBe("");
        expect(issue.state).toBe("unknown");
        expect(issue.labels).toEqual([]);
        expect(issue.blockedBy).toEqual([]);
      }),
    );
  });
});
