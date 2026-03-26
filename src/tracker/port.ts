import type { Issue } from "../core/types.js";

/**
 * Tracker abstraction that decouples orchestration logic from any specific
 * issue tracker (Linear, GitHub Issues, GitLab, Jira, etc.).
 *
 * Every tracker adapter must implement this interface. The orchestrator,
 * agent runner, HTTP layer, and all other consumers depend on TrackerPort
 * rather than a concrete tracker client.
 */
export interface TrackerPort {
  /** Fetch issues that are candidates for dispatch (active + terminal states). */
  fetchCandidateIssues(): Promise<Issue[]>;

  /** Fetch the current state of issues by their IDs. */
  fetchIssueStatesByIds(ids: string[]): Promise<Issue[]>;

  /** Fetch issues that are in any of the given state names. */
  fetchIssuesByStates(states: string[]): Promise<Issue[]>;

  /**
   * Resolve a human-readable state name to the tracker's internal state ID.
   * Returns null if the state name cannot be matched.
   */
  resolveStateId(stateName: string): Promise<string | null>;

  /** Transition an issue to the given state ID. */
  updateIssueState(issueId: string, stateId: string): Promise<void>;

  /** Post a comment on an issue. */
  createComment(issueId: string, body: string): Promise<void>;

  /**
   * Execute a state transition and return whether it succeeded.
   * Combines state-id resolution and the actual mutation in one call.
   */
  transitionIssue(issueId: string, stateId: string): Promise<{ success: boolean }>;
}
