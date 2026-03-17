import { describe, expect, it } from "vitest";

import { buildPlanningPrompt, generateIssuePlan } from "../src/planning-skill.js";

describe("planning-skill", () => {
  it("builds a planning prompt from a goal", () => {
    const prompt = buildPlanningPrompt({
      goal: "Ship a Docker-first Symphony service",
      maxIssues: 4,
    });

    expect(prompt).toContain("Goal: Ship a Docker-first Symphony service");
    expect(prompt).toContain("Maximum issue count: 4");
  });

  it("creates sequential issue proposals from multiline goals", () => {
    const plan = generateIssuePlan({
      goal: "- add API\n- wire UI\n- write tests",
      labels: ["Roadmap", "Planning"],
    });

    expect(plan.issues).toHaveLength(3);
    expect(plan.issues[0].id).toBe("PLAN-1");
    expect(plan.issues[1].dependencies).toEqual(["PLAN-1"]);
    expect(plan.issues[2].dependencies).toEqual(["PLAN-2"]);
    expect(plan.issues[0].labels).toEqual(["roadmap", "planning"]);
  });

  it("uses maxIssues cap and validates empty goals", () => {
    const capped = generateIssuePlan({
      goal: "one\ntwo\nthree\nfour",
      maxIssues: 2,
    });
    expect(capped.issues).toHaveLength(2);

    expect(() => generateIssuePlan({ goal: "   " })).toThrow("goal is required");
  });
});
