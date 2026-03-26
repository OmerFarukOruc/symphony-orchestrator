import { describe, expect, it } from "vitest";

import { buildIssueCommentMutation, buildIssueTransitionMutation } from "../../src/linear/transition-query.js";

describe("buildIssueCommentMutation", () => {
  it("is a mutation named SymphonyIssueCommentCreate", () => {
    const query = buildIssueCommentMutation();
    expect(query).toContain("mutation SymphonyIssueCommentCreate");
  });

  it("declares $issueId and $body variables", () => {
    const query = buildIssueCommentMutation();
    expect(query).toContain("$issueId: String!");
    expect(query).toContain("$body: String!");
  });

  it("calls commentCreate with issueId and body inputs", () => {
    const query = buildIssueCommentMutation();
    expect(query).toContain("commentCreate(input: { issueId: $issueId, body: $body })");
  });

  it("returns success and comment id", () => {
    const query = buildIssueCommentMutation();
    expect(query).toContain("success");
    expect(query).toContain("comment");
    expect(query).toContain("id");
  });

  it("matches snapshot", () => {
    expect(buildIssueCommentMutation()).toMatchSnapshot();
  });
});

describe("buildIssueTransitionMutation", () => {
  it("is a mutation named SymphonyIssueTransition", () => {
    const query = buildIssueTransitionMutation();
    expect(query).toContain("mutation SymphonyIssueTransition");
  });

  it("declares $issueId and optional $stateId variables", () => {
    const query = buildIssueTransitionMutation();
    expect(query).toContain("$issueId: String!");
    expect(query).toContain("$stateId: String");
    // stateId should be optional (no trailing !)
    expect(query).toMatch(/\$stateId: String\b[^!]/);
  });

  it("calls issueUpdate with id and stateId input", () => {
    const query = buildIssueTransitionMutation();
    expect(query).toContain("issueUpdate(id: $issueId, input: { stateId: $stateId })");
  });

  it("returns issue id, identifier, and state name", () => {
    const query = buildIssueTransitionMutation();
    expect(query).toContain("success");
    expect(query).toContain("identifier");
    expect(query).toContain("state {");
    expect(query).toContain("name");
  });

  it("matches snapshot", () => {
    expect(buildIssueTransitionMutation()).toMatchSnapshot();
  });
});
