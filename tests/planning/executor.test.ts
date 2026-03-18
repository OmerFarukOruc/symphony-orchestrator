import { describe, expect, it, vi } from "vitest";

import { createLinearPlanningExecutor } from "../../src/planning/executor.js";
import type { PlannedIssue } from "../../src/planning/skill.js";

describe("createLinearPlanningExecutor", () => {
  const issues: PlannedIssue[] = [
    {
      id: "PLAN-1",
      title: "Create backend slice",
      summary: "Implement the backend endpoint.",
      acceptanceCriteria: ["Adds an endpoint", "Covers the endpoint with tests"],
      dependencies: [],
      priority: "high",
      labels: ["backend", "api"],
    },
    {
      id: "PLAN-2",
      title: "Create frontend slice",
      summary: "Implement the frontend view.",
      acceptanceCriteria: ["Renders the endpoint output"],
      dependencies: ["PLAN-1"],
      priority: "medium",
      labels: ["frontend"],
    },
  ];

  it("maps created Linear issues to the planning execution response", async () => {
    const createIssuesFromPlan = vi.fn(async () => [
      { id: "issue-1", identifier: "ABC-101", url: "https://linear.example/ABC-101" },
      { id: "issue-2", identifier: "ABC-102", url: "https://linear.example/ABC-102" },
    ]);

    const executePlan = createLinearPlanningExecutor({
      linearClient: { createIssuesFromPlan } as never,
    });

    await expect(executePlan(issues)).resolves.toEqual({
      created: 2,
      externalIds: ["ABC-101", "ABC-102"],
    });
    expect(createIssuesFromPlan).toHaveBeenCalledTimes(1);
    expect(createIssuesFromPlan).toHaveBeenCalledWith(issues);
  });

  it("surfaces Linear creation failures", async () => {
    const createIssuesFromPlan = vi.fn(async () => {
      throw new Error("unable to resolve Linear project for slug EXAMPLE");
    });

    const executePlan = createLinearPlanningExecutor({
      linearClient: { createIssuesFromPlan } as never,
    });

    await expect(executePlan(issues)).rejects.toThrow("unable to resolve Linear project for slug EXAMPLE");
  });
});
