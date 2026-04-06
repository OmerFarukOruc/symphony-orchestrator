import { describe, expect, it } from "vitest";
import fc from "fast-check";
import path from "node:path";

import { sanitizeIdentifier, isWithinRoot, resolveWorkspacePath } from "../../src/workspace/paths.js";

/** Regex matching only safe filesystem characters: alphanumeric, dot, hyphen, underscore. */
const SAFE_CHARS = /^[\w.-]*$/;

/**
 * Arbitrary for directory roots: absolute paths with at least one
 * alphanumeric-leading segment to avoid edge cases like "/." resolving to "/".
 */
const rootArb = fc.stringMatching(/^\/[a-z]\w{0,19}$/);

/**
 * Arbitrary for child path segments: alphanumeric-leading names that
 * cannot be confused with ".." traversal segments.
 */
const childArb = fc.stringMatching(/^[a-z]\w{0,19}$/);

describe("property: sanitizeIdentifier", () => {
  it("output contains only safe filesystem characters", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = sanitizeIdentifier(input);
        expect(result).toMatch(SAFE_CHARS);
      }),
    );
  });

  it("preserves already-safe identifiers unchanged", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\w.-]{0,50}$/).filter((input) => input !== "." && input !== ".."),
        (input) => {
          expect(sanitizeIdentifier(input)).toBe(input);
        },
      ),
    );
  });

  it("output has the same length as the input", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(sanitizeIdentifier(input).length).toBe(input.length);
      }),
    );
  });

  it("is idempotent -- sanitizing twice gives the same result", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = sanitizeIdentifier(input);
        const twice = sanitizeIdentifier(once);
        expect(twice).toBe(once);
      }),
    );
  });
});

describe("property: isWithinRoot", () => {
  it("returns true when candidate is a child of root", () => {
    fc.assert(
      fc.property(rootArb, childArb, (root, child) => {
        const candidate = path.join(root, child);
        expect(isWithinRoot(root, candidate)).toBe(true);
      }),
    );
  });

  it("returns true when candidate equals root", () => {
    fc.assert(
      fc.property(rootArb, (root) => {
        expect(isWithinRoot(root, root)).toBe(true);
      }),
    );
  });

  it("returns false for paths that escape root via .. traversal", () => {
    fc.assert(
      fc.property(rootArb, childArb, (root, suffix) => {
        const candidate = path.resolve(root, "..", suffix);
        // Only assert false when the path actually escapes (candidate !== root)
        // Edge case: path.resolve("/v", "..", "v") === "/v" (returns to root, doesn't escape)
        if (candidate !== root) {
          expect(isWithinRoot(root, candidate)).toBe(false);
        } else {
          // When candidate equals root (edge case), isWithinRoot should return true
          expect(isWithinRoot(root, candidate)).toBe(true);
        }
      }),
    );
  });

  it("returns true for deeply nested children", () => {
    fc.assert(
      fc.property(rootArb, childArb, childArb, (root, mid, leaf) => {
        const candidate = path.join(root, mid, leaf);
        expect(isWithinRoot(root, candidate)).toBe(true);
      }),
    );
  });
});

describe("property: resolveWorkspacePath", () => {
  it("returns a path within the workspace root for safe identifiers", () => {
    fc.assert(
      fc.property(rootArb, childArb, (root, identifier) => {
        const { workspacePath, workspaceKey } = resolveWorkspacePath(root, identifier);
        expect(isWithinRoot(root, workspacePath)).toBe(true);
        expect(workspaceKey).toMatch(SAFE_CHARS);
      }),
    );
  });

  it("sanitizes the identifier before building the path", () => {
    fc.assert(
      fc.property(rootArb, fc.string({ minLength: 1, maxLength: 30 }), (root, identifier) => {
        const { workspaceKey } = resolveWorkspacePath(root, identifier);
        expect(workspaceKey).toBe(sanitizeIdentifier(identifier));
      }),
    );
  });

  it("never produces a path that escapes root after sanitization", () => {
    fc.assert(
      fc.property(rootArb, fc.string({ minLength: 1, maxLength: 30 }), (root, identifier) => {
        // sanitizeIdentifier replaces path separators with underscores,
        // so traversal attempts become harmless after sanitization
        const { workspacePath } = resolveWorkspacePath(root, identifier);
        expect(isWithinRoot(root, workspacePath)).toBe(true);
      }),
    );
  });
});
