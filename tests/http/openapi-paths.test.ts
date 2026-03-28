import { describe, expect, it } from "vitest";

import { buildInfrastructurePaths, buildIssuePaths, buildStateAndMetricsPaths } from "../../src/http/openapi-paths.js";

type PathItem = Record<string, Record<string, unknown>>;

/**
 * Collect every operationId from a set of path items.
 */
function collectOperationIds(paths: Record<string, PathItem>): string[] {
  const ids: string[] = [];
  for (const methods of Object.values(paths)) {
    for (const operation of Object.values(methods)) {
      if (typeof operation === "object" && operation !== null && "operationId" in operation) {
        ids.push(operation.operationId as string);
      }
    }
  }
  return ids;
}

describe("buildStateAndMetricsPaths", () => {
  const paths = buildStateAndMetricsPaths();

  it("returns a non-empty record", () => {
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });

  it("all paths follow /api/v1/ or /metrics convention", () => {
    for (const path of Object.keys(paths)) {
      expect(path.startsWith("/api/v1/") || path === "/metrics").toBe(true);
    }
  });

  it("includes GET /api/v1/state with expected structure", () => {
    const item = paths["/api/v1/state"] as PathItem;
    expect(item.get).toBeDefined();
    expect(item.get.summary).toBeDefined();
    expect(item.get.operationId).toBe("getState");
    expect(item.get.responses).toBeDefined();
  });

  it("includes GET /api/v1/runtime", () => {
    const item = paths["/api/v1/runtime"] as PathItem;
    expect(item.get).toBeDefined();
    expect(item.get.operationId).toBe("getRuntime");
  });

  it("includes POST /api/v1/refresh", () => {
    const item = paths["/api/v1/refresh"] as PathItem;
    expect(item.post).toBeDefined();
    expect(item.post.operationId).toBe("postRefresh");
    expect(item.post.responses).toHaveProperty("202");
  });

  it("includes GET /api/v1/transitions", () => {
    const item = paths["/api/v1/transitions"] as PathItem;
    expect(item.get).toBeDefined();
    expect(item.get.operationId).toBe("getTransitions");
  });

  it("includes GET /metrics with text/plain content type", () => {
    const item = paths["/metrics"] as PathItem;
    expect(item.get).toBeDefined();
    expect(item.get.operationId).toBe("getMetrics");
    const resp200 = item.get.responses as Record<string, Record<string, Record<string, unknown>>>;
    expect(resp200["200"].content).toHaveProperty("text/plain");
  });

  it("tags all operations as State & Metrics", () => {
    for (const methods of Object.values(paths)) {
      for (const op of Object.values(methods as PathItem)) {
        expect((op as Record<string, unknown>).tags).toContain("State & Metrics");
      }
    }
  });
});

describe("buildIssuePaths", () => {
  const paths = buildIssuePaths();

  it("returns a non-empty record", () => {
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });

  it("all paths follow /api/v1/ convention", () => {
    for (const path of Object.keys(paths)) {
      expect(path.startsWith("/api/v1/")).toBe(true);
    }
  });

  it("includes GET /api/v1/{issue_identifier} with parameters", () => {
    const item = paths["/api/v1/{issue_identifier}"] as PathItem;
    expect(item.get).toBeDefined();
    expect(item.get.operationId).toBe("getIssueDetail");
    expect(item.get.parameters).toBeInstanceOf(Array);
    expect((item.get.parameters as Array<Record<string, unknown>>).at(0)).toMatchObject({
      name: "issue_identifier",
      in: "path",
      required: true,
    });
  });

  it("includes POST /api/v1/{issue_identifier}/abort with multiple response codes", () => {
    const item = paths["/api/v1/{issue_identifier}/abort"] as PathItem;
    expect(item.post).toBeDefined();
    expect(item.post.operationId).toBe("abortIssue");
    const responses = item.post.responses as Record<string, unknown>;
    expect(responses).toHaveProperty("202");
    expect(responses).toHaveProperty("200");
    expect(responses).toHaveProperty("404");
    expect(responses).toHaveProperty("409");
  });

  it("includes POST /api/v1/{issue_identifier}/model with requestBody", () => {
    const item = paths["/api/v1/{issue_identifier}/model"] as PathItem;
    expect(item.post).toBeDefined();
    expect(item.post.operationId).toBe("updateModel");
    expect(item.post.requestBody).toBeDefined();
    const reqBody = item.post.requestBody as Record<string, unknown>;
    expect(reqBody.required).toBe(true);
  });

  it("includes POST /api/v1/{issue_identifier}/transition with requestBody", () => {
    const item = paths["/api/v1/{issue_identifier}/transition"] as PathItem;
    expect(item.post).toBeDefined();
    expect(item.post.operationId).toBe("transitionIssue");
    expect(item.post.requestBody).toBeDefined();
  });

  it("includes GET /api/v1/{issue_identifier}/attempts", () => {
    const item = paths["/api/v1/{issue_identifier}/attempts"] as PathItem;
    expect(item.get).toBeDefined();
    expect(item.get.operationId).toBe("listAttempts");
  });

  it("includes GET /api/v1/attempts/{attempt_id}", () => {
    const item = paths["/api/v1/attempts/{attempt_id}"] as PathItem;
    expect(item.get).toBeDefined();
    expect(item.get.operationId).toBe("getAttemptDetail");
  });
});

describe("buildInfrastructurePaths", () => {
  const paths = buildInfrastructurePaths();

  it("returns a non-empty record", () => {
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });

  it("all paths follow /api/v1/ convention", () => {
    for (const path of Object.keys(paths)) {
      expect(path.startsWith("/api/v1/")).toBe(true);
    }
  });

  it("includes workspace paths", () => {
    expect(paths["/api/v1/workspaces"]).toBeDefined();
    expect(paths["/api/v1/workspaces/{workspace_key}"]).toBeDefined();

    const listItem = paths["/api/v1/workspaces"] as PathItem;
    expect(listItem.get).toBeDefined();
    expect(listItem.get.operationId).toBe("listWorkspaces");

    const deleteItem = paths["/api/v1/workspaces/{workspace_key}"] as PathItem;
    expect(deleteItem.delete).toBeDefined();
    expect(deleteItem.delete.operationId).toBe("removeWorkspace");
  });

  it("includes git context path", () => {
    const item = paths["/api/v1/git/context"] as PathItem;
    expect(item.get).toBeDefined();
    expect(item.get.operationId).toBe("getGitContext");
  });

  it("includes config paths with multiple methods on overlay", () => {
    expect(paths["/api/v1/config"]).toBeDefined();
    expect(paths["/api/v1/config/schema"]).toBeDefined();
    expect(paths["/api/v1/config/overlay"]).toBeDefined();
    expect(paths["/api/v1/config/overlay/{path}"]).toBeDefined();

    const overlay = paths["/api/v1/config/overlay"] as PathItem;
    expect(overlay.get).toBeDefined();
    expect(overlay.put).toBeDefined();
    expect(overlay.get.operationId).toBe("getConfigOverlay");
    expect(overlay.put.operationId).toBe("putConfigOverlay");

    const overlayPath = paths["/api/v1/config/overlay/{path}"] as PathItem;
    expect(overlayPath.patch).toBeDefined();
    expect(overlayPath.delete).toBeDefined();
    expect(overlayPath.patch.operationId).toBe("patchConfigOverlayPath");
    expect(overlayPath.delete.operationId).toBe("deleteConfigOverlayPath");
  });

  it("includes secrets paths", () => {
    expect(paths["/api/v1/secrets"]).toBeDefined();
    expect(paths["/api/v1/secrets/{key}"]).toBeDefined();

    const list = paths["/api/v1/secrets"] as PathItem;
    expect(list.get).toBeDefined();
    expect(list.get.operationId).toBe("listSecrets");

    const keyItem = paths["/api/v1/secrets/{key}"] as PathItem;
    expect(keyItem.post).toBeDefined();
    expect(keyItem.delete).toBeDefined();
    expect(keyItem.post.operationId).toBe("setSecret");
    expect(keyItem.delete.operationId).toBe("deleteSecret");
  });
});

describe("cross-builder invariants", () => {
  const statePaths = buildStateAndMetricsPaths();
  const issuePaths = buildIssuePaths();
  const infraPaths = buildInfrastructurePaths();

  it("no duplicate operationIds across all builders", () => {
    const allIds = [
      ...collectOperationIds(statePaths),
      ...collectOperationIds(issuePaths),
      ...collectOperationIds(infraPaths),
    ];
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });

  it("no duplicate paths across builders", () => {
    const allPaths = [...Object.keys(statePaths), ...Object.keys(issuePaths), ...Object.keys(infraPaths)];
    const unique = new Set(allPaths);
    expect(unique.size).toBe(allPaths.length);
  });

  it("every operation has summary, operationId, and responses", () => {
    const allPaths = { ...statePaths, ...issuePaths, ...infraPaths };
    for (const [path, methods] of Object.entries(allPaths)) {
      for (const [method, op] of Object.entries(methods as PathItem)) {
        const operation = op as Record<string, unknown>;
        expect(operation.summary, `${method.toUpperCase()} ${path} missing summary`).toBeDefined();
        expect(operation.operationId, `${method.toUpperCase()} ${path} missing operationId`).toBeDefined();
        expect(operation.responses, `${method.toUpperCase()} ${path} missing responses`).toBeDefined();
      }
    }
  });

  it("all response objects are JSON-serializable", () => {
    const allPaths = { ...statePaths, ...issuePaths, ...infraPaths };
    expect(() => JSON.stringify(allPaths)).not.toThrow();
    const roundtripped = JSON.parse(JSON.stringify(allPaths));
    expect(roundtripped).toEqual(allPaths);
  });
});
