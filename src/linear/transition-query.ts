/** GraphQL query/mutation builders for issue state transitions and comments. */

export function buildIssueCommentMutation(): string {
  return `
    mutation SymphonyIssueCommentCreate($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
        comment {
          id
        }
      }
    }
  `;
}

export function buildIssueTransitionMutation(): string {
  return `
    mutation SymphonyIssueTransition($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
        issue {
          id
          identifier
          state {
            name
          }
        }
      }
    }
  `;
}
