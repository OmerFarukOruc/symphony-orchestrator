import type { PlannedIssue, PlanningPriority } from "../planning/skill.js";

interface LinearCreatedIssue {
  id: string;
  identifier: string;
  url: string | null;
}

export function normalizePlanningPriority(priority: PlanningPriority): number {
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

export function buildPlannedIssueDescription(
  issue: PlannedIssue,
  createdByPlanId: ReadonlyMap<string, LinearCreatedIssue>,
): string {
  const sections: string[] = [];
  if (issue.summary.trim()) {
    sections.push(issue.summary.trim());
  }

  if (issue.acceptanceCriteria.length > 0) {
    sections.push(
      ["Acceptance criteria:", ...issue.acceptanceCriteria.map((criterion) => `- ${criterion}`)].join("\n"),
    );
  }

  if (issue.dependencies.length > 0) {
    sections.push(
      [
        "Dependencies:",
        ...issue.dependencies.map((dependency) => {
          const created = createdByPlanId.get(dependency);
          return `- ${created?.identifier ?? dependency}`;
        }),
      ].join("\n"),
    );
  }

  sections.push(`Plan item: ${issue.id}`);
  return sections.filter(Boolean).join("\n\n");
}
