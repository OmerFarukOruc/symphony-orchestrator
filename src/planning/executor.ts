import type { LinearClient } from "../linear/client.js";
import type { PlanningExecutionResult } from "./api.js";
import type { PlannedIssue } from "./skill.js";

export function createLinearPlanningExecutor(deps: {
  linearClient: Pick<LinearClient, "createIssuesFromPlan">;
}): (issues: PlannedIssue[]) => Promise<PlanningExecutionResult> {
  return async (issues: PlannedIssue[]) => {
    const createdIssues = await deps.linearClient.createIssuesFromPlan(issues);
    return {
      created: createdIssues.length,
      externalIds: createdIssues.map((issue) => issue.identifier),
    };
  };
}
