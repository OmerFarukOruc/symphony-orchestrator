export type PlanningPriority = "low" | "medium" | "high";

export interface PlanningRequest {
  goal: string;
  maxIssues?: number;
  labels?: string[];
}

export interface PlannedIssue {
  id: string;
  title: string;
  summary: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  priority: PlanningPriority;
  labels: string[];
}

export interface PlanningResult {
  goal: string;
  generatedAt: string;
  issues: PlannedIssue[];
  prompt: string;
}

function cleanLine(value: string): string {
  return value
    .trim()
    .replace(/^[-*\d.)\s]+/, "")
    .trim();
}

function goalChunks(goal: string): string[] {
  const raw = goal
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.length > 0);

  if (raw.length > 0) {
    return raw;
  }
  return [goal.trim()].filter((line) => line.length > 0);
}

function inferPriority(text: string): PlanningPriority {
  const normalized = text.toLowerCase();
  if (normalized.includes("critical") || normalized.includes("urgent") || normalized.includes("blocker")) {
    return "high";
  }
  if (normalized.includes("nice to have") || normalized.includes("optional")) {
    return "low";
  }
  return "medium";
}

function makeAcceptanceCriteria(input: string): string[] {
  return [
    `Implements: ${input}`,
    "Includes deterministic test coverage for the behavior.",
    "Updates docs or operator notes where behavior is user-visible.",
  ];
}

function normalizeLabels(labels: string[] | undefined): string[] {
  if (!labels) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const label of labels) {
    const next = label.trim().toLowerCase();
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
}

export function buildPlanningPrompt(request: PlanningRequest): string {
  const maxIssues = request.maxIssues ?? 5;
  return [
    "You are planning implementation work as atomic tracker issues.",
    `Goal: ${request.goal.trim()}`,
    `Maximum issue count: ${maxIssues}`,
    "Return issue titles, acceptance criteria, and dependencies in execution order.",
  ].join("\n");
}

export function generateIssuePlan(request: PlanningRequest): PlanningResult {
  const goal = request.goal.trim();
  if (!goal) {
    throw new Error("goal is required");
  }

  const maxIssues = Math.max(1, Math.min(request.maxIssues ?? 5, 20));
  const labels = normalizeLabels(request.labels);
  const chunks = goalChunks(goal).slice(0, maxIssues);
  const issues: PlannedIssue[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const id = `PLAN-${index + 1}`;
    const prev = issues[index - 1];
    issues.push({
      id,
      title: `${chunk.slice(0, 72)}${chunk.length > 72 ? "..." : ""}`,
      summary: chunk,
      acceptanceCriteria: makeAcceptanceCriteria(chunk),
      dependencies: prev ? [prev.id] : [],
      priority: inferPriority(chunk),
      labels,
    });
  }

  return {
    goal,
    generatedAt: new Date().toISOString(),
    issues,
    prompt: buildPlanningPrompt({ ...request, goal }),
  };
}
