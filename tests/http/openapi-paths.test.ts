import { describe, expect, it } from "vitest";

import {
  buildInfrastructurePaths,
  buildIssuePaths,
  buildPrPaths,
  buildStateAndMetricsPaths,
} from "../../src/http/openapi-paths.js";

type TestPathItem = Record<string, Record<string, unknown>>;
type TestPaths = Record<string, Record<string, unknown>>;

/**
 * Collect every operationId from a set of path items.
 */
function collectOperationIds(paths: TestPaths): string[] {
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
    const item = paths["/api/v1/state"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get).toHaveProperty("summary");
    expect(item.get.operationId).toBe("getState");
    expect(item.get).toHaveProperty("responses");
    expect(item.get).toHaveProperty("security");
  });

  it("includes GET /api/v1/runtime", () => {
    const item = paths["/api/v1/runtime"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("getRuntime");
    expect(item.get).not.toHaveProperty("security");
  });

  it("includes POST /api/v1/refresh", () => {
    const item = paths["/api/v1/refresh"] as TestPathItem;
    expect(item).toHaveProperty("post");
    expect(item.post.operationId).toBe("postRefresh");
    expect(item.post.responses).toHaveProperty("202");
  });

  it("includes GET /api/v1/transitions", () => {
    const item = paths["/api/v1/transitions"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("getTransitions");
  });

  it("includes GET /metrics with text/plain content type", () => {
    const item = paths["/metrics"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("getMetrics");
    const resp200 = item.get.responses as Record<string, Record<string, Record<string, unknown>>>;
    expect(resp200["200"].content).toHaveProperty("text/plain");
  });

  it("tags all operations as State & Metrics", () => {
    for (const methods of Object.values(paths)) {
      for (const op of Object.values(methods as TestPathItem)) {
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
    const item = paths["/api/v1/{issue_identifier}"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("getIssueDetail");
    expect(item.get.parameters).toBeInstanceOf(Array);
    expect(item.get).toHaveProperty("security");
    const parameters = item.get.parameters as Array<Record<string, unknown>>;
    expect(parameters[0]).toMatchObject({
      name: "issue_identifier",
      in: "path",
      required: true,
    });
  });

  it("includes POST /api/v1/{issue_identifier}/abort with multiple response codes", () => {
    const item = paths["/api/v1/{issue_identifier}/abort"] as TestPathItem;
    expect(item).toHaveProperty("post");
    expect(item.post.operationId).toBe("abortIssue");
    const responses = item.post.responses as Record<string, unknown>;
    expect(responses).toHaveProperty("202");
    expect(responses).toHaveProperty("200");
    expect(responses).toHaveProperty("404");
    expect(responses).toHaveProperty("409");
  });

  it("includes POST /api/v1/{issue_identifier}/model with requestBody", () => {
    const item = paths["/api/v1/{issue_identifier}/model"] as TestPathItem;
    expect(item).toHaveProperty("post");
    expect(item.post.operationId).toBe("updateModel");
    expect(item.post).toHaveProperty("requestBody");
    const reqBody = item.post.requestBody as Record<string, unknown>;
    expect(reqBody.required).toBe(true);
    const responses = item.post.responses as Record<string, unknown>;
    expect(responses).toHaveProperty("202");
    expect(responses).not.toHaveProperty("200");
  });

  it("includes POST /api/v1/{issue_identifier}/transition with requestBody", () => {
    const item = paths["/api/v1/{issue_identifier}/transition"] as TestPathItem;
    expect(item).toHaveProperty("post");
    expect(item.post.operationId).toBe("transitionIssue");
    expect(item.post).toHaveProperty("requestBody");
  });

  it("includes GET /api/v1/{issue_identifier}/attempts", () => {
    const item = paths["/api/v1/{issue_identifier}/attempts"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("listAttempts");
  });

  it("includes GET /api/v1/attempts/{attempt_id}", () => {
    const item = paths["/api/v1/attempts/{attempt_id}"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("getAttemptDetail");
  });

  it("includes GET /api/v1/attempts/{attempt_id}/checkpoints", () => {
    const item = paths["/api/v1/attempts/{attempt_id}/checkpoints"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("listAttemptCheckpoints");
    expect(item.get).toHaveProperty("security");
  });
});

describe("buildPrPaths", () => {
  const paths = buildPrPaths();

  it("includes GET /api/v1/prs", () => {
    const item = paths["/api/v1/prs"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("listPrs");
    expect(item.get).toHaveProperty("security");
    expect(item.get).toHaveProperty("parameters");
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
    expect(paths).toHaveProperty("/api/v1/workspaces");
    expect(paths).toHaveProperty("/api/v1/workspaces/{workspace_key}");

    const listItem = paths["/api/v1/workspaces"] as TestPathItem;
    expect(listItem).toHaveProperty("get");
    expect(listItem.get.operationId).toBe("listWorkspaces");
    expect(listItem.get).toHaveProperty("security");

    const deleteItem = paths["/api/v1/workspaces/{workspace_key}"] as TestPathItem;
    expect(deleteItem).toHaveProperty("delete");
    expect(deleteItem.delete.operationId).toBe("removeWorkspace");
  });

  it("includes git context path", () => {
    const item = paths["/api/v1/git/context"] as TestPathItem;
    expect(item).toHaveProperty("get");
    expect(item.get.operationId).toBe("getGitContext");
    expect(item.get).toHaveProperty("security");
  });

  it("includes config paths with multiple methods on overlay", () => {
    expect(paths).toHaveProperty("/api/v1/config");
    expect(paths).toHaveProperty("/api/v1/config/schema");
    expect(paths).toHaveProperty("/api/v1/config/overlay");
    expect(paths).toHaveProperty("/api/v1/config/overlay/{path}");

    const overlay = paths["/api/v1/config/overlay"] as TestPathItem;
    expect(overlay).toHaveProperty("get");
    expect(overlay).toHaveProperty("put");
    expect(overlay.get.operationId).toBe("getConfigOverlay");
    expect(overlay.put.operationId).toBe("putConfigOverlay");

    const overlayPath = paths["/api/v1/config/overlay/{path}"] as TestPathItem;
    expect(overlayPath).toHaveProperty("patch");
    expect(overlayPath).toHaveProperty("delete");
    expect(overlayPath.patch.operationId).toBe("patchConfigOverlayPath");
    expect(overlayPath.delete.operationId).toBe("deleteConfigOverlayPath");
  });

  it("includes secrets paths", () => {
    expect(paths).toHaveProperty("/api/v1/secrets");
    expect(paths).toHaveProperty("/api/v1/secrets/{key}");

    const list = paths["/api/v1/secrets"] as TestPathItem;
    expect(list).toHaveProperty("get");
    expect(list.get.operationId).toBe("listSecrets");

    const keyItem = paths["/api/v1/secrets/{key}"] as TestPathItem;
    expect(keyItem).toHaveProperty("post");
    expect(keyItem).toHaveProperty("delete");
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
      for (const [method, op] of Object.entries(methods as TestPathItem)) {
        const operation = op as Record<string, unknown>;
        expect(operation.summary, `${method.toUpperCase()} ${path} missing summary`).toBeTypeOf("string");
        expect(operation.operationId, `${method.toUpperCase()} ${path} missing operationId`).toBeTypeOf("string");
        expect(operation.responses, `${method.toUpperCase()} ${path} missing responses`).toBeTypeOf("object");
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
