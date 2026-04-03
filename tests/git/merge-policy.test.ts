import { describe, expect, it } from "vitest";

import { evaluateMergePolicy } from "../../src/git/merge-policy.js";
import type { MergePolicy } from "../../src/core/types.js";

function makePolicy(overrides: Partial<MergePolicy> = {}): MergePolicy {
  return {
    enabled: true,
    allowedPaths: [],
    requireLabels: [],
    excludeLabels: [],
    maxChangedFiles: null,
    maxDiffLines: null,
    ...overrides,
  };
}

describe("evaluateMergePolicy", () => {
  // ── enabled flag ────────────────────────────────────────────────────────

  describe("enabled flag", () => {
    it("blocks immediately when enabled is false", () => {
      const result = evaluateMergePolicy(
        makePolicy({ enabled: false }),
        ["src/foo.ts"],
        { additions: 1, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("auto-merge disabled");
    });

    it("proceeds past enabled check when enabled is true", () => {
      const result = evaluateMergePolicy(makePolicy({ enabled: true }), [], { additions: 0, deletions: 0 }, []);
      expect(result.allowed).toBe(true);
    });
  });

  // ── excludeLabels ────────────────────────────────────────────────────────

  describe("excludeLabels", () => {
    it("blocks when an excluded label is present on the PR", () => {
      const result = evaluateMergePolicy(
        makePolicy({ excludeLabels: ["do-not-merge", "wip"] }),
        [],
        { additions: 0, deletions: 0 },
        ["wip", "enhancement"],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("wip");
    });

    it("allows when none of the excluded labels are present", () => {
      const result = evaluateMergePolicy(
        makePolicy({ excludeLabels: ["do-not-merge"] }),
        [],
        { additions: 0, deletions: 0 },
        ["bug", "enhancement"],
      );
      expect(result.allowed).toBe(true);
    });

    it("allows when excludeLabels is empty", () => {
      const result = evaluateMergePolicy(makePolicy({ excludeLabels: [] }), [], { additions: 0, deletions: 0 }, [
        "do-not-merge",
      ]);
      expect(result.allowed).toBe(true);
    });

    it("blocks on the first matching excluded label and stops", () => {
      const result = evaluateMergePolicy(
        makePolicy({ excludeLabels: ["blocked", "wip"] }),
        [],
        { additions: 0, deletions: 0 },
        ["blocked"],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked");
    });
  });

  // ── requireLabels ────────────────────────────────────────────────────────

  describe("requireLabels", () => {
    it("blocks when a required label is missing", () => {
      const result = evaluateMergePolicy(
        makePolicy({ requireLabels: ["ready-to-merge"] }),
        [],
        { additions: 0, deletions: 0 },
        ["bug"],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("ready-to-merge");
    });

    it("allows when all required labels are present", () => {
      const result = evaluateMergePolicy(
        makePolicy({ requireLabels: ["ready-to-merge", "approved"] }),
        [],
        { additions: 0, deletions: 0 },
        ["ready-to-merge", "approved", "bug"],
      );
      expect(result.allowed).toBe(true);
    });

    it("allows when requireLabels is empty", () => {
      const result = evaluateMergePolicy(makePolicy({ requireLabels: [] }), [], { additions: 0, deletions: 0 }, []);
      expect(result.allowed).toBe(true);
    });

    it("lists all missing required labels in the reason", () => {
      const result = evaluateMergePolicy(
        makePolicy({ requireLabels: ["approved", "tested"] }),
        [],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("approved");
      expect(result.reason).toContain("tested");
    });
  });

  // ── maxChangedFiles ──────────────────────────────────────────────────────

  describe("maxChangedFiles", () => {
    it("blocks when changed file count exceeds the limit", () => {
      const result = evaluateMergePolicy(
        makePolicy({ maxChangedFiles: 2 }),
        ["a.ts", "b.ts", "c.ts"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("3");
      expect(result.reason).toContain("maxChangedFiles 2");
    });

    it("allows when changed file count is exactly at the limit", () => {
      const result = evaluateMergePolicy(
        makePolicy({ maxChangedFiles: 3 }),
        ["a.ts", "b.ts", "c.ts"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(true);
    });

    it("allows when changed file count is below the limit", () => {
      const result = evaluateMergePolicy(
        makePolicy({ maxChangedFiles: 5 }),
        ["a.ts"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(true);
    });

    it("applies no file count limit when maxChangedFiles is null", () => {
      const result = evaluateMergePolicy(
        makePolicy({ maxChangedFiles: null }),
        ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(true);
    });

    it("applies no file count limit when maxChangedFiles is undefined", () => {
      const policy: MergePolicy = { ...makePolicy(), maxChangedFiles: undefined };
      const result = evaluateMergePolicy(policy, ["a.ts", "b.ts", "c.ts"], { additions: 0, deletions: 0 }, []);
      expect(result.allowed).toBe(true);
    });
  });

  // ── maxDiffLines ─────────────────────────────────────────────────────────

  describe("maxDiffLines", () => {
    it("blocks when total diff lines exceed the limit", () => {
      const result = evaluateMergePolicy(makePolicy({ maxDiffLines: 100 }), [], { additions: 80, deletions: 30 }, []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("110");
      expect(result.reason).toContain("maxDiffLines 100");
    });

    it("allows when total diff lines are exactly at the limit", () => {
      const result = evaluateMergePolicy(makePolicy({ maxDiffLines: 100 }), [], { additions: 70, deletions: 30 }, []);
      expect(result.allowed).toBe(true);
    });

    it("allows when total diff lines are below the limit", () => {
      const result = evaluateMergePolicy(makePolicy({ maxDiffLines: 500 }), [], { additions: 10, deletions: 5 }, []);
      expect(result.allowed).toBe(true);
    });

    it("applies no diff line limit when maxDiffLines is null", () => {
      const result = evaluateMergePolicy(
        makePolicy({ maxDiffLines: null }),
        [],
        { additions: 100000, deletions: 100000 },
        [],
      );
      expect(result.allowed).toBe(true);
    });

    it("sums additions and deletions correctly", () => {
      const result = evaluateMergePolicy(makePolicy({ maxDiffLines: 10 }), [], { additions: 6, deletions: 6 }, []);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("12");
    });
  });

  // ── allowedPaths ─────────────────────────────────────────────────────────

  describe("allowedPaths", () => {
    it("allows all files when allowedPaths is empty", () => {
      const result = evaluateMergePolicy(
        makePolicy({ allowedPaths: [] }),
        ["src/anything.ts", "docs/readme.md", "random/file.json"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(true);
    });

    it("allows when every changed file matches at least one allowed prefix", () => {
      const result = evaluateMergePolicy(
        makePolicy({ allowedPaths: ["src/", "tests/"] }),
        ["src/foo.ts", "src/bar.ts", "tests/foo.test.ts"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(true);
    });

    it("blocks when a changed file does not match any allowed prefix", () => {
      const result = evaluateMergePolicy(
        makePolicy({ allowedPaths: ["src/"] }),
        ["src/foo.ts", "docs/readme.md"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.blockedFiles).toEqual(["docs/readme.md"]);
      expect(result.reason).toContain("docs/readme.md");
    });

    it("lists all blocked files when multiple are outside allowed paths", () => {
      const result = evaluateMergePolicy(
        makePolicy({ allowedPaths: ["src/"] }),
        ["src/foo.ts", "docs/a.md", "infra/b.tf"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(false);
      expect(result.blockedFiles).toEqual(["docs/a.md", "infra/b.tf"]);
    });

    it("does not populate blockedFiles when the block is for a different reason", () => {
      const result = evaluateMergePolicy(
        makePolicy({ enabled: false }),
        ["docs/readme.md"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.blockedFiles).toBeUndefined();
    });

    it("allows a file that exactly matches an allowed prefix (no trailing slash required)", () => {
      const result = evaluateMergePolicy(
        makePolicy({ allowedPaths: ["src"] }),
        ["src/foo.ts"],
        { additions: 0, deletions: 0 },
        [],
      );
      expect(result.allowed).toBe(true);
    });
  });

  // ── happy path: all conditions pass ─────────────────────────────────────

  describe("full happy path", () => {
    it("allows when all conditions are satisfied", () => {
      const result = evaluateMergePolicy(
        makePolicy({
          enabled: true,
          allowedPaths: ["src/", "tests/"],
          maxChangedFiles: 10,
          maxDiffLines: 500,
          requireLabels: ["approved"],
          excludeLabels: ["do-not-merge"],
        }),
        ["src/foo.ts", "tests/foo.test.ts"],
        { additions: 20, deletions: 10 },
        ["approved", "bug"],
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.blockedFiles).toBeUndefined();
    });
  });

  // ── check order: excludeLabels before requireLabels ──────────────────────

  describe("check ordering", () => {
    it("blocks on excludeLabels before evaluating requireLabels", () => {
      const result = evaluateMergePolicy(
        makePolicy({ excludeLabels: ["blocked"], requireLabels: ["approved"] }),
        [],
        { additions: 0, deletions: 0 },
        ["blocked"], // has excluded label; missing required label
      );
      // Should hit excludeLabels first
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked");
    });

    it("blocks on requireLabels before evaluating maxChangedFiles", () => {
      const result = evaluateMergePolicy(
        makePolicy({ requireLabels: ["approved"], maxChangedFiles: 1 }),
        ["a.ts", "b.ts", "c.ts"],
        { additions: 0, deletions: 0 },
        [], // missing required label, and also over file limit
      );
      // Should hit requireLabels first
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("approved");
    });
  });
});
