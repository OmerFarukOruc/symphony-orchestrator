import express, { type Request, type Response, type Router } from "express";

import { asRecord } from "../utils/type-guards.js";
import { generateIssuePlan, type PlannedIssue, type PlanningRequest, type PlanningResult } from "./skill.js";

export interface PlanningExecutionResult {
  created: number;
  externalIds: string[];
}

interface PlanningApiDeps {
  createPlan?: (request: PlanningRequest) => PlanningResult;
  executePlan?: (issues: PlannedIssue[]) => Promise<PlanningExecutionResult>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePlanningRequest(body: unknown): PlanningRequest | null {
  const record = asRecord(body);
  const goal = typeof record.goal === "string" ? record.goal.trim() : "";
  if (!goal) {
    return null;
  }
  let maxIssues: number | undefined;
  if (typeof record.max_issues === "number" && Number.isFinite(record.max_issues)) {
    maxIssues = Math.trunc(record.max_issues);
  } else if (typeof record.maxIssues === "number" && Number.isFinite(record.maxIssues)) {
    maxIssues = Math.trunc(record.maxIssues);
  }
  const labels = asStringArray(record.labels);

  return {
    goal,
    maxIssues,
    labels: labels.length > 0 ? labels : undefined,
  };
}

function parseIssueArray(body: unknown): PlannedIssue[] | null {
  const record = asRecord(body);
  const issues = record.issues;
  if (!Array.isArray(issues)) {
    return null;
  }
  const parsed = issues
    .map((issue) => parsePlannedIssue(issue))
    .filter((issue): issue is PlannedIssue => issue !== null);
  return parsed.length === issues.length ? parsed : null;
}

function parseStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function parsePriority(value: unknown): "low" | "medium" | "high" | null {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return null;
}

function validateMatchingLengths(parsed: string[], raw: unknown): boolean {
  return Array.isArray(raw) && parsed.length === raw.length;
}

function parsePlannedIssue(value: unknown): PlannedIssue | null {
  const record = asRecord(value);
  const id = parseStringField(record, "id");
  const title = parseStringField(record, "title");
  const summary = parseStringField(record, "summary");
  const priority = parsePriority(record.priority);
  const acceptanceCriteria = asStringArray(record.acceptanceCriteria);
  const dependencies = asStringArray(record.dependencies);
  const labels = asStringArray(record.labels);

  if (!id || !title || !summary || !priority) {
    return null;
  }
  if (!validateMatchingLengths(acceptanceCriteria, record.acceptanceCriteria)) {
    return null;
  }
  if (!validateMatchingLengths(dependencies, record.dependencies)) {
    return null;
  }
  if (Array.isArray(record.labels) && labels.length !== record.labels.length) {
    return null;
  }
  return { id, title, summary, acceptanceCriteria, dependencies, priority, labels };
}

export function createPlanningRouter(deps: PlanningApiDeps = {}): Router {
  const router = express.Router();
  const createPlan = deps.createPlan ?? generateIssuePlan;

  router.post("/api/v1/plan", (request: Request, response: Response) => {
    const parsed = parsePlanningRequest(request.body);
    if (!parsed) {
      response.status(400).json({
        error: {
          code: "invalid_goal",
          message: "goal is required",
        },
      });
      return;
    }

    try {
      const plan = createPlan(parsed);
      response.status(200).json(plan);
    } catch (error) {
      response.status(400).json({
        error: {
          code: "planning_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  router.post("/api/v1/plan/execute", async (request: Request, response: Response) => {
    const issues = parseIssueArray(request.body);
    if (!issues) {
      response.status(400).json({
        error: {
          code: "invalid_issues",
          message: "issues array must contain valid planned issues",
        },
      });
      return;
    }

    if (!deps.executePlan) {
      response.status(501).json({
        error: {
          code: "not_implemented",
          message: "plan execution is not configured",
        },
      });
      return;
    }

    try {
      const result = await deps.executePlan(issues);
      response.status(202).json({
        created: result.created,
        external_ids: result.externalIds,
      });
    } catch (error) {
      response.status(502).json({
        error: {
          code: "execution_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  return router;
}
