import type { Issue } from "../core/types.js";
import type { LinearClient } from "../linear/client.js";
import { buildIssueTransitionMutation } from "../linear/transition-query.js";
import { asBooleanOrNull, asRecord } from "../utils/type-guards.js";
import type { TrackerIssueCreateInput, TrackerIssueCreateResult, TrackerPort } from "./port.js";

/**
 * Thin adapter that implements TrackerPort by delegating to LinearClient.
 * All Linear-specific logic remains in LinearClient; this adapter provides
 * the tracker-agnostic surface that orchestration code depends on.
 */
export class LinearTrackerAdapter implements TrackerPort {
  constructor(private readonly client: LinearClient) {}

  fetchCandidateIssues(): Promise<Issue[]> {
    return this.client.fetchCandidateIssues();
  }

  fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    return this.client.fetchIssueStatesByIds(ids);
  }

  fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    return this.client.fetchIssuesByStates(states);
  }

  resolveStateId(stateName: string): Promise<string | null> {
    return this.client.resolveStateId(stateName);
  }

  updateIssueState(issueId: string, stateId: string): Promise<void> {
    return this.client.updateIssueState(issueId, stateId);
  }

  createComment(issueId: string, body: string): Promise<void> {
    return this.client.createComment(issueId, body);
  }

  createIssue(input: TrackerIssueCreateInput): Promise<TrackerIssueCreateResult> {
    return this.client.createIssue({
      title: input.title,
      description: input.description ?? null,
      stateName: input.stateName ?? null,
    });
  }

  async transitionIssue(issueId: string, stateId: string): Promise<{ success: boolean }> {
    const payload = await this.client.runGraphQL(buildIssueTransitionMutation(), { issueId, stateId });
    const issueUpdate = asRecord(asRecord(payload.data).issueUpdate);
    const success = asBooleanOrNull(issueUpdate.success) ?? false;
    return { success };
  }
}
