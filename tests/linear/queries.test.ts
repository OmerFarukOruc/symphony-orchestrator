import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  buildCandidateIssuesQuery,
  buildCandidateIssuesByStateIdsQuery,
  buildIssuesByIdsQuery,
  buildIssuesByStatesQuery,
  buildProjectLookupQuery,
  buildTeamStatesQuery,
  buildCreateIssueMutation,
  buildCreateLabelMutation,
  buildTeamsQuery,
  buildCreateProjectMutation,
} from "../../src/linear/queries.js";

describe("PAGE_SIZE", () => {
  it("is 50", () => {
    expect(PAGE_SIZE).toBe(50);
  });
});

describe("buildCandidateIssuesQuery", () => {
  it("produces valid GraphQL without project filter", () => {
    const query = buildCandidateIssuesQuery(false);
    expect(query).toContain("query RisolutoCandidateIssues");
    expect(query).toContain("$after: String");
    expect(query).toContain("$activeStates: [String!]");
    expect(query).toContain(`first: ${PAGE_SIZE}`);
    expect(query).toContain("state: { name: { in: $activeStates } }");
    expect(query).toContain("hasNextPage");
    expect(query).toContain("endCursor");
  });

  it("excludes project filter variables and clause when disabled", () => {
    const query = buildCandidateIssuesQuery(false);
    expect(query).not.toContain("$projectSlug");
    expect(query).not.toContain("slugId");
  });

  it("includes project filter variables and clause when enabled", () => {
    const query = buildCandidateIssuesQuery(true);
    expect(query).toContain("$projectSlug: String!");
    expect(query).toContain("project: { slugId: { eq: $projectSlug } }");
  });

  it("matches snapshot without project filter", () => {
    expect(buildCandidateIssuesQuery(false)).toMatchSnapshot();
  });

  it("matches snapshot with project filter", () => {
    expect(buildCandidateIssuesQuery(true)).toMatchSnapshot();
  });
});

describe("buildCandidateIssuesByStateIdsQuery", () => {
  it("produces valid GraphQL without project filter", () => {
    const query = buildCandidateIssuesByStateIdsQuery(false);
    expect(query).toContain("query RisolutoCandidateIssuesByStateIds");
    expect(query).toContain("$stateIds: [ID!]");
    expect(query).toContain(`first: ${PAGE_SIZE}`);
    expect(query).toContain("state: { id: { in: $stateIds } }");
  });

  it("excludes project filter when disabled", () => {
    const query = buildCandidateIssuesByStateIdsQuery(false);
    expect(query).not.toContain("$projectSlug");
    expect(query).not.toContain("slugId");
  });

  it("includes project filter when enabled", () => {
    const query = buildCandidateIssuesByStateIdsQuery(true);
    expect(query).toContain("$projectSlug: String!");
    expect(query).toContain("project: { slugId: { eq: $projectSlug } }");
  });

  it("matches snapshot without project filter", () => {
    expect(buildCandidateIssuesByStateIdsQuery(false)).toMatchSnapshot();
  });

  it("matches snapshot with project filter", () => {
    expect(buildCandidateIssuesByStateIdsQuery(true)).toMatchSnapshot();
  });
});

describe("buildIssuesByIdsQuery", () => {
  it("declares $ids and $after variables", () => {
    const query = buildIssuesByIdsQuery();
    expect(query).toContain("$ids: [ID!]");
    expect(query).toContain("$after: String");
  });

  it("filters by id list", () => {
    const query = buildIssuesByIdsQuery();
    expect(query).toContain("filter: { id: { in: $ids } }");
  });

  it("uses PAGE_SIZE", () => {
    const query = buildIssuesByIdsQuery();
    expect(query).toContain(`first: ${PAGE_SIZE}`);
  });

  it("matches snapshot", () => {
    expect(buildIssuesByIdsQuery()).toMatchSnapshot();
  });
});

describe("buildIssuesByStatesQuery", () => {
  it("declares $states variable", () => {
    const query = buildIssuesByStatesQuery();
    expect(query).toContain("$states: [String!]");
  });

  it("filters by state name", () => {
    const query = buildIssuesByStatesQuery();
    expect(query).toContain("state: { name: { in: $states } }");
  });

  it("matches snapshot", () => {
    expect(buildIssuesByStatesQuery()).toMatchSnapshot();
  });
});

describe("buildProjectLookupQuery", () => {
  it("declares $projectSlug variable", () => {
    const query = buildProjectLookupQuery();
    expect(query).toContain("$projectSlug: String!");
  });

  it("filters projects by slugId", () => {
    const query = buildProjectLookupQuery();
    expect(query).toContain("slugId: { eq: $projectSlug }");
  });

  it("selects project fields including nested teams", () => {
    const query = buildProjectLookupQuery();
    expect(query).toContain("id");
    expect(query).toContain("name");
    expect(query).toContain("slugId");
    expect(query).toContain("teams(first: 1)");
  });

  it("matches snapshot", () => {
    expect(buildProjectLookupQuery()).toMatchSnapshot();
  });
});

describe("buildTeamStatesQuery", () => {
  it("declares $teamId variable", () => {
    const query = buildTeamStatesQuery();
    expect(query).toContain("$teamId: String!");
  });

  it("selects state fields", () => {
    const query = buildTeamStatesQuery();
    expect(query).toContain("states");
    expect(query).toContain("name");
    expect(query).toContain("type");
  });

  it("matches snapshot", () => {
    expect(buildTeamStatesQuery()).toMatchSnapshot();
  });
});

describe("buildCreateIssueMutation", () => {
  it("is a mutation named RisolutoCreateIssue", () => {
    const query = buildCreateIssueMutation();
    expect(query).toContain("mutation RisolutoCreateIssue");
  });

  it("declares all required and optional variables", () => {
    const query = buildCreateIssueMutation();
    expect(query).toContain("$teamId: String!");
    expect(query).toContain("$projectId: String");
    expect(query).toContain("$title: String!");
    expect(query).toContain("$description: String");
    expect(query).toContain("$stateId: String");
  });

  it("returns success and issue fields", () => {
    const query = buildCreateIssueMutation();
    expect(query).toContain("success");
    expect(query).toContain("identifier");
    expect(query).toContain("url");
  });

  it("matches snapshot", () => {
    expect(buildCreateIssueMutation()).toMatchSnapshot();
  });
});

describe("buildCreateLabelMutation", () => {
  it("is a mutation named RisolutoCreateLabel", () => {
    const query = buildCreateLabelMutation();
    expect(query).toContain("mutation RisolutoCreateLabel");
  });

  it("declares teamId, name, and color variables", () => {
    const query = buildCreateLabelMutation();
    expect(query).toContain("$teamId: String");
    expect(query).toContain("$name: String!");
    expect(query).toContain("$color: String");
  });

  it("matches snapshot", () => {
    expect(buildCreateLabelMutation()).toMatchSnapshot();
  });
});

describe("buildTeamsQuery", () => {
  it("is a query named RisolutoTeams", () => {
    const query = buildTeamsQuery();
    expect(query).toContain("query RisolutoTeams");
  });

  it("requests team id, name, and key", () => {
    const query = buildTeamsQuery();
    expect(query).toContain("id");
    expect(query).toContain("name");
    expect(query).toContain("key");
  });

  it("matches snapshot", () => {
    expect(buildTeamsQuery()).toMatchSnapshot();
  });
});

describe("buildCreateProjectMutation", () => {
  it("is a mutation named RisolutoCreateProject", () => {
    const query = buildCreateProjectMutation();
    expect(query).toContain("mutation RisolutoCreateProject");
  });

  it("declares $name and $teamIds variables", () => {
    const query = buildCreateProjectMutation();
    expect(query).toContain("$name: String!");
    expect(query).toContain("$teamIds: [String!]!");
  });

  it("returns project fields including slugId and url", () => {
    const query = buildCreateProjectMutation();
    expect(query).toContain("slugId");
    expect(query).toContain("url");
  });

  it("matches snapshot", () => {
    expect(buildCreateProjectMutation()).toMatchSnapshot();
  });
});
