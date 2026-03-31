/**
 * Exempt: pure OpenAPI path builders kept together for spec discoverability.
 *
 * OpenAPI path definitions for all Risoluto API routes.
 *
 * Each builder function returns a group of path items keyed by route path.
 * Used by `openapi.ts` to assemble the full spec.
 */

import { z } from "zod";

import { modelUpdateSchema, transitionSchema } from "./request-schemas.js";
import {
  abortResponseSchema,
  attemptsListResponseSchema,
  errorResponseSchema,
  refreshResponseSchema,
  runtimeResponseSchema,
  transitionResponseSchema,
  validationErrorSchema,
} from "./response-schemas.js";

type JsonSchema = Record<string, unknown>;

interface PathItem {
  [method: string]: unknown;
}

function jsonContent(schema: JsonSchema): Record<string, unknown> {
  return { "application/json": { schema } };
}

function jsonResponse(description: string, schema: JsonSchema): Record<string, unknown> {
  return { description, content: jsonContent(schema) };
}

function errorResponse(description: string): Record<string, unknown> {
  return jsonResponse(description, toSchema(errorResponseSchema));
}

function toSchema(zodSchema: z.ZodType): JsonSchema {
  return z.toJSONSchema(zodSchema) as JsonSchema;
}

function pathParam(name: string, description?: string): Record<string, unknown> {
  const param: Record<string, unknown> = {
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  };
  if (description) param.description = description;
  return param;
}

export function buildStateAndMetricsPaths(): Record<string, PathItem> {
  return {
    "/api/v1/state": {
      get: {
        tags: ["State & Metrics"],
        summary: "Get runtime state snapshot",
        operationId: "getState",
        responses: {
          "200": jsonResponse("Current runtime snapshot", { type: "object" }),
        },
      },
    },
    "/api/v1/runtime": {
      get: {
        tags: ["State & Metrics"],
        summary: "Get runtime metadata",
        operationId: "getRuntime",
        responses: {
          "200": jsonResponse("Runtime information", toSchema(runtimeResponseSchema)),
        },
      },
    },
    "/api/v1/refresh": {
      post: {
        tags: ["State & Metrics"],
        summary: "Request a tracker refresh",
        operationId: "postRefresh",
        responses: {
          "202": jsonResponse("Refresh queued", toSchema(refreshResponseSchema)),
        },
      },
    },
    "/api/v1/transitions": {
      get: {
        tags: ["State & Metrics"],
        summary: "Get available state transitions",
        operationId: "getTransitions",
        responses: {
          "200": jsonResponse("Transitions list", { type: "object" }),
        },
      },
    },
    "/metrics": {
      get: {
        tags: ["State & Metrics"],
        summary: "Prometheus-style metrics",
        operationId: "getMetrics",
        responses: {
          "200": {
            description: "Plain-text metrics",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        },
      },
    },
  };
}

export function buildIssuePaths(): Record<string, PathItem> {
  return {
    "/api/v1/{issue_identifier}": {
      get: {
        tags: ["Issues"],
        summary: "Get issue detail",
        operationId: "getIssueDetail",
        parameters: [pathParam("issue_identifier", "Issue identifier (e.g. ENG-123)")],
        responses: {
          "200": jsonResponse("Issue detail", { type: "object" }),
          "404": errorResponse("Issue not found"),
        },
      },
    },
    "/api/v1/{issue_identifier}/abort": {
      post: {
        tags: ["Issues"],
        summary: "Abort a running issue",
        operationId: "abortIssue",
        parameters: [pathParam("issue_identifier", "Issue identifier (e.g. ENG-123)")],
        responses: {
          "202": jsonResponse("Abort accepted", toSchema(abortResponseSchema)),
          "200": jsonResponse("Already stopping", toSchema(abortResponseSchema)),
          "404": errorResponse("Issue not found"),
          "409": errorResponse("Conflict"),
        },
      },
    },
    "/api/v1/{issue_identifier}/model": {
      post: {
        tags: ["Issues"],
        summary: "Update model override for an issue",
        operationId: "updateModel",
        parameters: [pathParam("issue_identifier", "Issue identifier (e.g. ENG-123)")],
        requestBody: {
          required: true,
          content: jsonContent(toSchema(modelUpdateSchema)),
        },
        responses: {
          "200": jsonResponse("Model updated", { type: "object" }),
          "400": jsonResponse("Validation error", toSchema(validationErrorSchema)),
        },
      },
    },
    "/api/v1/{issue_identifier}/transition": {
      post: {
        tags: ["Issues"],
        summary: "Transition an issue to a new state",
        operationId: "transitionIssue",
        parameters: [pathParam("issue_identifier", "Issue identifier (e.g. ENG-123)")],
        requestBody: {
          required: true,
          content: jsonContent(toSchema(transitionSchema)),
        },
        responses: {
          "200": jsonResponse("Transition applied", toSchema(transitionResponseSchema)),
          "400": jsonResponse("Validation error", toSchema(validationErrorSchema)),
        },
      },
    },
    "/api/v1/{issue_identifier}/attempts": {
      get: {
        tags: ["Attempts"],
        summary: "List attempts for an issue",
        operationId: "listAttempts",
        parameters: [pathParam("issue_identifier", "Issue identifier (e.g. ENG-123)")],
        responses: {
          "200": jsonResponse("Attempts list", toSchema(attemptsListResponseSchema)),
          "404": errorResponse("Issue not found"),
        },
      },
    },
    "/api/v1/attempts/{attempt_id}": {
      get: {
        tags: ["Attempts"],
        summary: "Get attempt detail",
        operationId: "getAttemptDetail",
        parameters: [pathParam("attempt_id")],
        responses: {
          "200": jsonResponse("Attempt detail", { type: "object" }),
          "404": errorResponse("Attempt not found"),
        },
      },
    },
  };
}

export function buildInfrastructurePaths(): Record<string, PathItem> {
  return {
    ...buildWorkspacePaths(),
    ...buildGitPaths(),
    ...buildConfigPaths(),
    ...buildSecretsPaths(),
  };
}

function buildWorkspacePaths(): Record<string, PathItem> {
  return {
    "/api/v1/workspaces": {
      get: {
        tags: ["Workspaces"],
        summary: "List workspaces",
        operationId: "listWorkspaces",
        responses: {
          "200": jsonResponse("Workspace inventory", { type: "object" }),
        },
      },
    },
    "/api/v1/workspaces/{workspace_key}": {
      delete: {
        tags: ["Workspaces"],
        summary: "Remove a workspace",
        operationId: "removeWorkspace",
        parameters: [pathParam("workspace_key")],
        responses: {
          "204": { description: "Workspace removed" },
          "404": errorResponse("Workspace not found"),
        },
      },
    },
  };
}

function buildGitPaths(): Record<string, PathItem> {
  return {
    "/api/v1/git/context": {
      get: {
        tags: ["Git"],
        summary: "Get git context for the workspace",
        operationId: "getGitContext",
        responses: {
          "200": jsonResponse("Git context", { type: "object" }),
        },
      },
    },
  };
}

function buildConfigPaths(): Record<string, PathItem> {
  return {
    "/api/v1/config": {
      get: {
        tags: ["Config"],
        summary: "Get effective configuration",
        operationId: "getConfig",
        responses: {
          "200": jsonResponse("Effective config", { type: "object" }),
        },
      },
    },
    "/api/v1/config/schema": {
      get: {
        tags: ["Config"],
        summary: "Get config schema",
        operationId: "getConfigSchema",
        responses: {
          "200": jsonResponse("Config schema", { type: "object" }),
        },
      },
    },
    "/api/v1/config/overlay": {
      get: {
        tags: ["Config"],
        summary: "Get config overlay",
        operationId: "getConfigOverlay",
        responses: {
          "200": jsonResponse("Config overlay", { type: "object" }),
        },
      },
      put: {
        tags: ["Config"],
        summary: "Update config overlay",
        operationId: "putConfigOverlay",
        requestBody: {
          required: true,
          content: jsonContent({ type: "object" }),
        },
        responses: {
          "200": jsonResponse("Overlay updated", { type: "object" }),
          "400": errorResponse("Invalid overlay payload"),
        },
      },
    },
    "/api/v1/config/overlay/{path}": {
      patch: {
        tags: ["Config"],
        summary: "Set a single config overlay value",
        operationId: "patchConfigOverlayPath",
        parameters: [pathParam("path")],
        requestBody: {
          required: true,
          content: jsonContent({
            type: "object",
            properties: { value: {} },
            required: ["value"],
          }),
        },
        responses: {
          "200": jsonResponse("Value set", { type: "object" }),
          "400": errorResponse("Invalid overlay path or payload"),
        },
      },
      delete: {
        tags: ["Config"],
        summary: "Delete a config overlay path",
        operationId: "deleteConfigOverlayPath",
        parameters: [pathParam("path")],
        responses: {
          "204": { description: "Path deleted" },
          "404": errorResponse("Path not found"),
        },
      },
    },
  };
}

function buildSecretsPaths(): Record<string, PathItem> {
  return {
    "/api/v1/secrets": {
      get: {
        tags: ["Secrets"],
        summary: "List secret keys",
        operationId: "listSecrets",
        responses: {
          "200": jsonResponse("Secret keys", {
            type: "object",
            properties: { keys: { type: "array", items: { type: "string" } } },
          }),
        },
      },
    },
    "/api/v1/secrets/{key}": {
      post: {
        tags: ["Secrets"],
        summary: "Set a secret",
        operationId: "setSecret",
        parameters: [pathParam("key")],
        requestBody: {
          required: true,
          content: jsonContent({
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          }),
        },
        responses: {
          "204": { description: "Secret stored" },
          "400": errorResponse("Invalid secret key or value"),
        },
      },
      delete: {
        tags: ["Secrets"],
        summary: "Delete a secret",
        operationId: "deleteSecret",
        parameters: [pathParam("key")],
        responses: {
          "204": { description: "Secret deleted" },
          "404": errorResponse("Secret not found"),
        },
      },
    },
  };
}
