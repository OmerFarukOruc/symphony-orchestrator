/** GraphQL query/mutation builders for issue state transitions. */

export function buildWorkflowStateLookupAllQuery(): string {
  return `
    query SymphonyAllWorkflowStates {
      workflowStates(first: 250) {
        nodes {
          id
          name
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
