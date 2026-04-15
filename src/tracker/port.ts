import type { Issue } from "../core/types.js";

export interface TrackerIssueCreateInput {
  title: string;
  description?: string | null;
  stateName?: string | null;
}

export interface TrackerIssueCreateResult {
  issueId: string;
  identifier: string;
  url: string | null;
}

export interface TrackerProvisionProjectOption {
  id: unknown;
  name: unknown;
  slugId: unknown;
  teamKey: string | null;
}

export interface TrackerProvisionProjectRecord {
  id?: string;
  name?: string;
  slugId?: string;
  url: string | null;
  teamKey: string | null;
}

export interface TrackerProvisionListProjectsInput {
  type: "list_projects";
}

export interface TrackerProvisionSelectProjectInput {
  type: "select_project";
  slugId: string;
}

export interface TrackerProvisionCreateProjectInput {
  type: "create_project";
  name: string;
}

export interface TrackerProvisionCreateTestIssueInput {
  type: "create_test_issue";
}

export interface TrackerProvisionCreateLabelInput {
  type: "create_label";
}

export type TrackerProvisionInput =
  | TrackerProvisionListProjectsInput
  | TrackerProvisionSelectProjectInput
  | TrackerProvisionCreateProjectInput
  | TrackerProvisionCreateTestIssueInput
  | TrackerProvisionCreateLabelInput;

export interface TrackerProvisionListProjectsResult {
  projects: TrackerProvisionProjectOption[];
}

export interface TrackerProvisionSelectProjectResult {
  ok: true;
}

export interface TrackerProvisionCreateProjectResult {
  ok: true;
  project: TrackerProvisionProjectRecord;
}

export interface TrackerProvisionCreateTestIssueResult {
  ok: true;
  issueIdentifier: string;
  issueUrl: string;
}

export interface TrackerProvisionCreateLabelResult {
  ok: true;
  labelId: string;
  labelName: string;
  alreadyExists: boolean;
}

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

  /** Create a new tracker issue and return its stable identifiers. */
  createIssue(input: TrackerIssueCreateInput): Promise<TrackerIssueCreateResult>;

  /**
   * Execute a state transition and return whether it succeeded.
   * Combines state-id resolution and the actual mutation in one call.
   */
  transitionIssue(issueId: string, stateId: string): Promise<{ success: boolean }>;

  /** Perform tracker-owned setup provisioning without leaking provider specifics into setup routes. */
  provision(input: TrackerProvisionListProjectsInput): Promise<TrackerProvisionListProjectsResult>;
  provision(input: TrackerProvisionSelectProjectInput): Promise<TrackerProvisionSelectProjectResult>;
  provision(input: TrackerProvisionCreateProjectInput): Promise<TrackerProvisionCreateProjectResult>;
  provision(input: TrackerProvisionCreateTestIssueInput): Promise<TrackerProvisionCreateTestIssueResult>;
  provision(input: TrackerProvisionCreateLabelInput): Promise<TrackerProvisionCreateLabelResult>;
}
