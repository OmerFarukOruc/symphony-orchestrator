import type { PlannedIssue } from "../types";

export interface PlannerState {
  step: "input" | "review" | "result";
  goal: string;
  maxIssues?: number;
  labels: string[];
  plan: PlannedIssue[] | null;
  executing: boolean;
  result: { created: { identifier: string; url: string }[] } | null;
  error: string | null;
}

export function createPlannerState(): PlannerState {
  return {
    step: "input",
    goal: "",
    maxIssues: undefined,
    labels: [],
    plan: null,
    executing: false,
    result: null,
    error: null,
  };
}

export function clonePlan(plan: PlannedIssue[] | null): PlannedIssue[] | null {
  return (
    plan?.map((issue) => ({
      ...issue,
      acceptanceCriteria: [...issue.acceptanceCriteria],
      dependencies: [...issue.dependencies],
      labels: [...issue.labels],
    })) ?? null
  );
}
