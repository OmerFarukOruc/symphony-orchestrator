import { describe, expect, it } from "vitest";

import { normalizeIssue } from "../../src/linear/issue-parser.js";

function makeRawIssue(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "issue-abc",
    identifier: "MT-42",
    title: "Fix the login bug",
    description: "Users cannot log in with SSO",
    priority: 1,
    branchName: "mt-42-fix-the-login-bug",
    url: "https://linear.app/team/issue/MT-42",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    state: { name: "In Progress" },
    labels: { nodes: [{ name: "Bug" }, { name: "Frontend" }] },
    inverseRelations: { nodes: [] },
    ...overrides,
  };
}

describe("normalizeIssue", () => {
  it("normalizes a complete issue", () => {
    const issue = normalizeIssue(makeRawIssue());
    expect(issue.id).toBe("issue-abc");
    expect(issue.identifier).toBe("MT-42");
    expect(issue.title).toBe("Fix the login bug");
    expect(issue.description).toBe("Users cannot log in with SSO");
    expect(issue.priority).toBe(1);
    expect(issue.branchName).toBe("mt-42-fix-the-login-bug");
    expect(issue.url).toBe("https://linear.app/team/issue/MT-42");
    expect(issue.state).toBe("In Progress");
    expect(issue.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(issue.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("lowercases label names", () => {
    const issue = normalizeIssue(
      makeRawIssue({
        labels: { nodes: [{ name: "Bug" }, { name: "FRONTEND" }, { name: "back-End" }] },
      }),
    );
    expect(issue.labels).toEqual(["bug", "frontend", "back-end"]);
  });

  it("filters null label names", () => {
    const issue = normalizeIssue(
      makeRawIssue({
        labels: { nodes: [{ name: "Bug" }, { name: null }, {}] },
      }),
    );
    expect(issue.labels).toEqual(["bug"]);
  });

  it("returns empty labels array when labels.nodes is empty", () => {
    const issue = normalizeIssue(makeRawIssue({ labels: { nodes: [] } }));
    expect(issue.labels).toEqual([]);
  });

  it("returns empty labels array when labels field is missing", () => {
    const issue = normalizeIssue(makeRawIssue({ labels: undefined }));
    expect(issue.labels).toEqual([]);
  });

  it("normalizes null description to null", () => {
    const issue = normalizeIssue(makeRawIssue({ description: null }));
    expect(issue.description).toBe(null);
  });

  it("normalizes missing description to null", () => {
    const issue = normalizeIssue(makeRawIssue({ description: undefined }));
    expect(issue.description).toBe(null);
  });

  it("sets priority to null for non-integer values", () => {
    const issue = normalizeIssue(makeRawIssue({ priority: "high" }));
    expect(issue.priority).toBe(null);
  });

  it("sets priority to null for floats", () => {
    const issue = normalizeIssue(makeRawIssue({ priority: 1.5 }));
    expect(issue.priority).toBe(null);
  });

  it("accepts priority 0", () => {
    const issue = normalizeIssue(makeRawIssue({ priority: 0 }));
    expect(issue.priority).toBe(0);
  });

  it("falls back to empty string for missing id", () => {
    const issue = normalizeIssue(makeRawIssue({ id: undefined }));
    expect(issue.id).toBe("");
  });

  it("falls back to empty string for missing identifier", () => {
    const issue = normalizeIssue(makeRawIssue({ identifier: undefined }));
    expect(issue.identifier).toBe("");
  });

  it("falls back to 'unknown' for missing state", () => {
    const issue = normalizeIssue(makeRawIssue({ state: undefined }));
    expect(issue.state).toBe("unknown");
  });

  it("handles null raw input (fallbacks to empty defaults)", () => {
    const issue = normalizeIssue(null);
    expect(issue.id).toBe("");
    expect(issue.identifier).toBe("");
    expect(issue.state).toBe("unknown");
    expect(issue.labels).toEqual([]);
    expect(issue.blockedBy).toEqual([]);
  });

  describe("normalizeBlockers", () => {
    it("returns empty blockedBy when inverseRelations nodes is empty", () => {
      const issue = normalizeIssue(makeRawIssue({ inverseRelations: { nodes: [] } }));
      expect(issue.blockedBy).toEqual([]);
    });

    it("identifies the blocker correctly when issue is the blocking side", () => {
      // issue.id === issueId means relatedIssue is the blocker
      const raw = makeRawIssue({
        id: "the-issue",
        inverseRelations: {
          nodes: [
            {
              issue: { id: "the-issue", identifier: "MT-1", state: { name: "In Progress" } },
              relatedIssue: { id: "blocker-id", identifier: "MT-2", state: { name: "Todo" } },
            },
          ],
        },
      });
      const issue = normalizeIssue(raw);
      expect(issue.blockedBy).toHaveLength(1);
      expect(issue.blockedBy[0].identifier).toBe("MT-2");
      expect(issue.blockedBy[0].state).toBe("Todo");
    });

    it("identifies the blocker correctly when relatedIssue is the blocking side", () => {
      // issue.id !== issueId so the `issue` field is the blocker
      const raw = makeRawIssue({
        id: "the-issue",
        inverseRelations: {
          nodes: [
            {
              issue: { id: "blocker-id", identifier: "MT-99", state: { name: "Done" } },
              relatedIssue: { id: "the-issue", identifier: "MT-1", state: { name: "In Progress" } },
            },
          ],
        },
      });
      const issue = normalizeIssue(raw);
      expect(issue.blockedBy).toHaveLength(1);
      expect(issue.blockedBy[0].identifier).toBe("MT-99");
    });

    it("handles missing blocker state gracefully", () => {
      const raw = makeRawIssue({
        id: "the-issue",
        inverseRelations: {
          nodes: [
            {
              issue: { id: "the-issue", identifier: "MT-1" },
              relatedIssue: { id: "blocker-id", identifier: "MT-2" },
            },
          ],
        },
      });
      const issue = normalizeIssue(raw);
      expect(issue.blockedBy[0].state).toBe(null);
    });
  });
});
