import http from "node:http";

import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlanningRouter } from "../src/planning-api.js";

describe("planning-api", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (!server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    server = null;
  });

  async function startServer(router: express.Router): Promise<string> {
    const app = express();
    app.use(express.json());
    app.use(router);

    server = await new Promise<http.Server>((resolve) => {
      const started = app.listen(0, "127.0.0.1", () => resolve(started));
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to resolve test server address");
    }
    return `http://127.0.0.1:${address.port}`;
  }

  it("returns a generated plan", async () => {
    const base = await startServer(createPlanningRouter());
    const response = await fetch(`${base}/api/v1/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Add planning API\nAdd docs" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.goal).toBe("Add planning API\nAdd docs");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBe(2);
  });

  it("rejects missing goal payload", async () => {
    const base = await startServer(createPlanningRouter());
    const response = await fetch(`${base}/api/v1/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_goal");
  });

  it("returns not_implemented for execute endpoint when no executor is provided", async () => {
    const base = await startServer(createPlanningRouter());
    const response = await fetch(`${base}/api/v1/plan/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issues: [] }),
    });
    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.error.code).toBe("not_implemented");
  });

  it("delegates plan execution when executor is provided", async () => {
    const executePlan = vi.fn(async () => ({
      created: 2,
      externalIds: ["ABC-1", "ABC-2"],
    }));
    const base = await startServer(createPlanningRouter({ executePlan }));
    const response = await fetch(`${base}/api/v1/plan/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issues: [
          {
            id: "PLAN-1",
            title: "A",
            summary: "A",
            acceptanceCriteria: [],
            dependencies: [],
            priority: "medium",
            labels: [],
          },
          {
            id: "PLAN-2",
            title: "B",
            summary: "B",
            acceptanceCriteria: [],
            dependencies: ["PLAN-1"],
            priority: "medium",
            labels: [],
          },
        ],
      }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({
      created: 2,
      external_ids: ["ABC-1", "ABC-2"],
    });
    expect(executePlan).toHaveBeenCalledTimes(1);
  });
});
