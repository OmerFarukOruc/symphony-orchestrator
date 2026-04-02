/**
 * Live smoke tests for the Linear provider.
 *
 * These tests exercise real Linear API endpoints and require a valid
 * `LINEAR_API_KEY` environment variable.  They are excluded from the
 * default `test:integration` runner and only execute via
 * `pnpm run test:integration:live`.
 *
 * When the env var is absent the entire suite skips gracefully.
 */

import { afterAll, describe, expect, it } from "vitest";

const LINEAR_API_KEY = process.env.LINEAR_API_KEY ?? "";
const LINEAR_API_ENDPOINT = process.env.LINEAR_API_ENDPOINT ?? "https://api.linear.app/graphql";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GraphQLPayload {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

async function runGraphQL(query: string, variables?: Record<string, unknown>): Promise<GraphQLPayload> {
  const response = await fetch(LINEAR_API_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API returned HTTP ${response.status}`);
  }

  return (await response.json()) as GraphQLPayload;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!LINEAR_API_KEY)("linear live smoke", () => {
  /** Issue IDs created during tests — deleted in afterAll for cleanup. */
  const createdIssueIds: string[] = [];

  afterAll(async () => {
    for (const issueId of createdIssueIds) {
      try {
        await runGraphQL(`mutation DeleteIssue($id: String!) { issueDelete(id: $id) { success } }`, { id: issueId });
      } catch {
        // Best-effort cleanup — do not fail the suite
      }
    }
  });

  // -----------------------------------------------------------------------
  // Auth check
  // -----------------------------------------------------------------------

  it("authenticates and fetches viewer identity", async () => {
    const result = await runGraphQL(`query { viewer { id name email } }`);

    expect(result.errors).toBeUndefined();
    expect(result.data).toBeDefined();

    const viewer = result.data!.viewer as Record<string, unknown>;
    expect(typeof viewer.id).toBe("string");
    expect((viewer.id as string).length).toBeGreaterThan(0);
    expect(typeof viewer.name).toBe("string");
  });

  // -----------------------------------------------------------------------
  // Team listing — response shape validation
  // -----------------------------------------------------------------------

  it("lists teams with expected response shape", async () => {
    const result = await runGraphQL(`
      query {
        teams(first: 5) {
          nodes {
            id
            name
            key
          }
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(result.data).toBeDefined();

    const teams = result.data!.teams as { nodes: Array<Record<string, unknown>> };
    expect(Array.isArray(teams.nodes)).toBe(true);

    if (teams.nodes.length > 0) {
      const team = teams.nodes[0];
      expect(typeof team.id).toBe("string");
      expect(typeof team.name).toBe("string");
      expect(typeof team.key).toBe("string");
    }
  });

  // -----------------------------------------------------------------------
  // Issue query — shape matches app expectations
  // -----------------------------------------------------------------------

  it("queries issues from the first team with expected shape", async () => {
    // Grab the first team to scope the issue query
    const teamsResult = await runGraphQL(`
      query { teams(first: 1) { nodes { id } } }
    `);
    const teamNodes = (teamsResult.data!.teams as { nodes: Array<Record<string, unknown>> }).nodes;
    if (teamNodes.length === 0) {
      // Workspace has no teams — nothing to query
      return;
    }

    const teamId = teamNodes[0].id as string;

    const result = await runGraphQL(
      `
      query($teamId: ID) {
        issues(first: 5, filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            identifier
            title
            description
            priority
            state { name }
            branchName
            url
            labels { nodes { name } }
            createdAt
            updatedAt
          }
          pageInfo { hasNextPage endCursor }
        }
      }
      `,
      { teamId },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toBeDefined();

    const issues = result.data!.issues as {
      nodes: Array<Record<string, unknown>>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    expect(Array.isArray(issues.nodes)).toBe(true);
    expect(typeof issues.pageInfo.hasNextPage).toBe("boolean");

    if (issues.nodes.length > 0) {
      const issue = issues.nodes[0];
      expect(typeof issue.id).toBe("string");
      expect(typeof issue.identifier).toBe("string");
      expect(typeof issue.title).toBe("string");
    }
  });

  // -----------------------------------------------------------------------
  // Pagination — cursor behavior
  // -----------------------------------------------------------------------

  it("supports cursor-based pagination", async () => {
    const page1 = await runGraphQL(`
      query {
        issues(first: 1) {
          nodes { id }
          pageInfo { hasNextPage endCursor }
        }
      }
    `);

    expect(page1.errors).toBeUndefined();
    const pageInfo1 = (page1.data!.issues as { pageInfo: { hasNextPage: boolean; endCursor: string | null } }).pageInfo;

    if (!pageInfo1.hasNextPage) {
      // Workspace has <= 1 issue — pagination not testable
      return;
    }

    const page2 = await runGraphQL(
      `
      query($after: String) {
        issues(first: 1, after: $after) {
          nodes { id }
          pageInfo { hasNextPage endCursor }
        }
      }
      `,
      { after: pageInfo1.endCursor },
    );

    expect(page2.errors).toBeUndefined();
    const page2Nodes = (page2.data!.issues as { nodes: Array<Record<string, unknown>> }).nodes;
    expect(Array.isArray(page2Nodes)).toBe(true);

    // Second page should return a different issue
    const page1Id = (page1.data!.issues as { nodes: Array<Record<string, unknown>> }).nodes[0].id;
    if (page2Nodes.length > 0) {
      expect(page2Nodes[0].id).not.toBe(page1Id);
    }
  });

  // -----------------------------------------------------------------------
  // Issue lifecycle — create, transition, comment, verify, delete
  // -----------------------------------------------------------------------

  it("creates, transitions, comments on, and deletes an issue", async () => {
    // 1) Find a team
    const teamsResult = await runGraphQL(`
      query { teams(first: 1) { nodes { id } } }
    `);
    const teamNodes = (teamsResult.data!.teams as { nodes: Array<Record<string, unknown>> }).nodes;
    if (teamNodes.length === 0) return;

    const teamId = teamNodes[0].id as string;

    // 2) Create issue
    const createResult = await runGraphQL(
      `
      mutation($teamId: String!, $title: String!, $description: String) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
          success
          issue { id identifier title state { id name } }
        }
      }
      `,
      { teamId, title: "[Risoluto CI] Live smoke test issue", description: "Automated test — safe to delete." },
    );

    expect(createResult.errors).toBeUndefined();
    const created = createResult.data!.issueCreate as {
      success: boolean;
      issue: { id: string; identifier: string; title: string; state: { id: string; name: string } };
    };
    expect(created.success).toBe(true);
    expect(typeof created.issue.id).toBe("string");
    createdIssueIds.push(created.issue.id);

    // 3) Fetch available workflow states for the team
    const statesResult = await runGraphQL(
      `
      query($teamId: ID) {
        workflowStates(filter: { team: { id: { eq: $teamId } } }) {
          nodes { id name }
        }
      }
      `,
      { teamId },
    );
    const stateNodes = (statesResult.data!.workflowStates as { nodes: Array<{ id: string; name: string }> }).nodes;
    const currentStateId = created.issue.state.id;
    const nextState = stateNodes.find((s) => s.id !== currentStateId);

    // 4) Transition to a different state (if one exists)
    if (nextState) {
      const transitionResult = await runGraphQL(
        `
        mutation($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) { success issue { state { name } } }
        }
        `,
        { id: created.issue.id, stateId: nextState.id },
      );
      expect(transitionResult.errors).toBeUndefined();
      const updated = transitionResult.data!.issueUpdate as { success: boolean; issue: { state: { name: string } } };
      expect(updated.success).toBe(true);
    }

    // 5) Add comment
    const commentResult = await runGraphQL(
      `
      mutation($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id body } }
      }
      `,
      { issueId: created.issue.id, body: "Automated comment from Risoluto live smoke test." },
    );
    expect(commentResult.errors).toBeUndefined();
    const comment = commentResult.data!.commentCreate as { success: boolean; comment: { id: string; body: string } };
    expect(comment.success).toBe(true);

    // 6) Verify comment exists on the issue
    const fetchResult = await runGraphQL(
      `
      query($id: String!) {
        issue(id: $id) { comments { nodes { id body } } }
      }
      `,
      { id: created.issue.id },
    );
    expect(fetchResult.errors).toBeUndefined();
    const comments = (fetchResult.data!.issue as { comments: { nodes: Array<{ id: string; body: string }> } }).comments
      .nodes;
    expect(comments.some((c) => c.id === comment.comment.id)).toBe(true);

    // Cleanup happens in afterAll via createdIssueIds
  });
});
