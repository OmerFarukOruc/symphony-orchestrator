/**
 * Exempt: pure OpenAPI path builders kept together for spec discoverability.
 *
 * OpenAPI path definitions for all Risoluto API routes.
 *
 * Each builder function returns a group of path items keyed by route path.
 * Used by `openapi.ts` to assemble the full spec.
 */

import { z } from "zod";

import { modelUpdateSchema, transitionSchema, triggerSchema } from "./request-schemas.js";
import {
  abortResponseSchema,
  alertHistoryListResponseSchema,
  automationRunResponseSchema,
  automationRunsListResponseSchema,
  automationsListResponseSchema,
  attemptDetailResponseSchema,
  attemptsListResponseSchema,
  checkpointsListResponseSchema,
  configOverlayGetResponseSchema,
  configOverlayPatchResponseSchema,
  configOverlayPutRequestSchema,
  configOverlayPutResponseSchema,
  configResponseSchema,
  configSchemaResponseSchema,
  errorResponseSchema,
  gitContextResponseSchema,
  issueDetailResponseSchema,
  modelUpdateResponseSchema,
  notificationReadResponseSchema,
  notificationsListResponseSchema,
  notificationsReadAllResponseSchema,
  prsListResponseSchema,
  recoveryReportResponseSchema,
  refreshResponseSchema,
  runtimeResponseSchema,
  stateResponseSchema,
  triggerResponseSchema,
  transitionResponseSchema,
  transitionsListResponseSchema,
  validationErrorSchema,
  webhookAcceptedResponseSchema,
  workspaceInventoryResponseSchema,
} from "./response-schemas.js";

type JsonSchema = Record<string, unknown>;

interface PathItem {
  [method: string]: unknown;
}

const protectedReadSecurity = [{ bearerAuth: [] }];

function jsonContent(schema: JsonSchema): Record<string, unknown> {
  return { "application/json": { schema } };
}

function jsonResponse(description: string, schema: JsonSchema): Record<string, unknown> {
  return { description, content: jsonContent(schema) };
}

function errorResponse(description: string): Record<string, unknown> {
  return jsonResponse(description, toSchema(errorResponseSchema));
}

function protectedReadResponses(successDescription: string, successSchema: JsonSchema): Record<string, unknown> {
  return {
    "200": jsonResponse(successDescription, successSchema),
    "401": errorResponse("Valid read token required"),
    "403": errorResponse("Remote read access is not configured"),
  };
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
        security: protectedReadSecurity,
        responses: protectedReadResponses("Current runtime snapshot", toSchema(stateResponseSchema)),
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
    "/api/v1/recovery": {
      get: {
        tags: ["State & Metrics"],
        summary: "Get the latest startup recovery report",
        operationId: "getRecoveryReport",
        security: protectedReadSecurity,
        responses: protectedReadResponses("Startup recovery report", toSchema(recoveryReportResponseSchema)),
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
        security: protectedReadSecurity,
        responses: protectedReadResponses("Transitions list", toSchema(transitionsListResponseSchema)),
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
          ...protectedReadResponses("Issue detail", toSchema(issueDetailResponseSchema)),
          "404": errorResponse("Issue not found"),
        },
        security: protectedReadSecurity,
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
          "202": jsonResponse("Model updated", toSchema(modelUpdateResponseSchema)),
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
          ...protectedReadResponses("Attempts list", toSchema(attemptsListResponseSchema)),
          "404": errorResponse("Issue not found"),
        },
        security: protectedReadSecurity,
      },
    },
    "/api/v1/attempts/{attempt_id}": {
      get: {
        tags: ["Attempts"],
        summary: "Get attempt detail",
        operationId: "getAttemptDetail",
        parameters: [pathParam("attempt_id")],
        responses: {
          ...protectedReadResponses("Attempt detail", toSchema(attemptDetailResponseSchema)),
          "404": errorResponse("Attempt not found"),
        },
        security: protectedReadSecurity,
      },
    },
    "/api/v1/attempts/{attempt_id}/checkpoints": {
      get: {
        tags: ["Attempts"],
        summary: "Get checkpoint history for an attempt",
        operationId: "listAttemptCheckpoints",
        parameters: [pathParam("attempt_id")],
        security: protectedReadSecurity,
        responses: {
          "200": jsonResponse("Checkpoint list", toSchema(checkpointsListResponseSchema)),
          "404": errorResponse("Attempt not found"),
          "503": errorResponse("Attempt store not configured"),
        },
      },
    },
  };
}

export function buildPrPaths(): Record<string, PathItem> {
  return {
    "/api/v1/prs": {
      get: {
        tags: ["Pull Requests"],
        summary: "Get PR status overview",
        operationId: "listPrs",
        security: protectedReadSecurity,
        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["open", "merged", "closed"] },
          },
        ],
        responses: {
          "200": jsonResponse("PR status overview", toSchema(prsListResponseSchema)),
          "400": errorResponse("Invalid status filter"),
          "503": errorResponse("Attempt store not configured"),
        },
      },
    },
  };
}

export function buildNotificationPaths(): Record<string, PathItem> {
  return {
    "/api/v1/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List persisted notifications",
        operationId: "listNotifications",
        security: protectedReadSecurity,
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 500 },
          },
          {
            name: "unread",
            in: "query",
            required: false,
            schema: { type: "boolean" },
          },
        ],
        responses: {
          ...protectedReadResponses("Notification timeline", toSchema(notificationsListResponseSchema)),
          "400": errorResponse("Validation error"),
          "503": errorResponse("Notification store not configured"),
        },
      },
    },
    "/api/v1/notifications/{notification_id}/read": {
      post: {
        tags: ["Notifications"],
        summary: "Mark a notification as read",
        operationId: "markNotificationRead",
        parameters: [pathParam("notification_id", "Notification identifier")],
        responses: {
          "200": jsonResponse("Notification updated", toSchema(notificationReadResponseSchema)),
          "404": errorResponse("Notification not found"),
          "503": errorResponse("Notification store not configured"),
        },
      },
    },
    "/api/v1/notifications/read-all": {
      post: {
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
        operationId: "markAllNotificationsRead",
        responses: {
          "200": jsonResponse("Notifications updated", toSchema(notificationsReadAllResponseSchema)),
          "503": errorResponse("Notification store not configured"),
        },
      },
    },
  };
}

export function buildAutomationPaths(): Record<string, PathItem> {
  return {
    "/api/v1/automations": {
      get: {
        tags: ["Automations"],
        summary: "List configured automations and scheduler state",
        operationId: "listAutomations",
        responses: {
          "200": jsonResponse("Automation definitions", toSchema(automationsListResponseSchema)),
          "503": errorResponse("Automation scheduler not available"),
        },
      },
    },
    "/api/v1/automations/runs": {
      get: {
        tags: ["Automations"],
        summary: "List automation run history",
        operationId: "listAutomationRuns",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 500 },
          },
          {
            name: "automation_name",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": jsonResponse("Automation run history", toSchema(automationRunsListResponseSchema)),
          "400": errorResponse("Validation error"),
          "503": errorResponse("Automation store not available"),
        },
      },
    },
    "/api/v1/automations/{automation_name}/run": {
      post: {
        tags: ["Automations"],
        summary: "Run a configured automation immediately",
        operationId: "runAutomationNow",
        parameters: [pathParam("automation_name", "Automation name")],
        responses: {
          "202": jsonResponse("Automation run accepted", toSchema(automationRunResponseSchema)),
          "404": errorResponse("Automation not found"),
          "503": errorResponse("Automation scheduler not available"),
        },
      },
    },
  };
}

export function buildAlertPaths(): Record<string, PathItem> {
  return {
    "/api/v1/alerts/history": {
      get: {
        tags: ["Alerts"],
        summary: "List alert delivery and cooldown history",
        operationId: "listAlertHistory",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 500 },
          },
          {
            name: "rule_name",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": jsonResponse("Alert history", toSchema(alertHistoryListResponseSchema)),
          "400": errorResponse("Validation error"),
          "503": errorResponse("Alert history store not available"),
        },
      },
    },
  };
}

export function buildIngressPaths(): Record<string, PathItem> {
  return {
    "/api/v1/webhooks/trigger": {
      post: {
        tags: ["Ingress"],
        summary: "Dispatch an authenticated trigger action",
        operationId: "dispatchTrigger",
        requestBody: {
          required: true,
          content: jsonContent(toSchema(triggerSchema)),
        },
        responses: {
          "202": jsonResponse("Trigger accepted", toSchema(triggerResponseSchema)),
          "200": jsonResponse("Duplicate trigger accepted without reprocessing", toSchema(triggerResponseSchema)),
          "400": jsonResponse("Validation error", toSchema(validationErrorSchema)),
          "401": errorResponse("Invalid trigger credentials"),
          "403": errorResponse("Trigger action is not allowed"),
          "503": errorResponse("Trigger endpoint is not configured"),
        },
      },
    },
    "/webhooks/linear": {
      post: {
        tags: ["Ingress"],
        summary: "Receive a signed Linear webhook delivery",
        operationId: "receiveLinearWebhook",
        responses: {
          "200": jsonResponse("Webhook accepted", toSchema(webhookAcceptedResponseSchema)),
          "400": errorResponse("Invalid payload"),
          "401": errorResponse("Invalid or missing Linear signature"),
          "503": errorResponse("Webhook secret is not configured"),
        },
      },
    },
    "/webhooks/github": {
      post: {
        tags: ["Ingress"],
        summary: "Receive a signed GitHub webhook delivery",
        operationId: "receiveGitHubWebhook",
        responses: {
          "200": jsonResponse("Webhook accepted", toSchema(webhookAcceptedResponseSchema)),
          "400": errorResponse("Missing or invalid GitHub event metadata"),
          "401": errorResponse("Invalid or missing GitHub signature"),
          "503": errorResponse("GitHub webhook secret is not configured"),
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
        security: protectedReadSecurity,
        responses: protectedReadResponses("Workspace inventory", toSchema(workspaceInventoryResponseSchema)),
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
        security: protectedReadSecurity,
        responses: protectedReadResponses("Git context", toSchema(gitContextResponseSchema)),
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
        security: protectedReadSecurity,
        responses: protectedReadResponses("Effective config", toSchema(configResponseSchema)),
      },
    },
    "/api/v1/config/schema": {
      get: {
        tags: ["Config"],
        summary: "Get config schema",
        operationId: "getConfigSchema",
        security: protectedReadSecurity,
        responses: protectedReadResponses("Config schema", toSchema(configSchemaResponseSchema)),
      },
    },
    "/api/v1/config/overlay": {
      get: {
        tags: ["Config"],
        summary: "Get config overlay",
        operationId: "getConfigOverlay",
        security: protectedReadSecurity,
        responses: protectedReadResponses("Config overlay", toSchema(configOverlayGetResponseSchema)),
      },
      put: {
        tags: ["Config"],
        summary: "Update config overlay",
        operationId: "putConfigOverlay",
        requestBody: {
          required: true,
          content: jsonContent(toSchema(configOverlayPutRequestSchema)),
        },
        responses: {
          "200": jsonResponse("Overlay updated", toSchema(configOverlayPutResponseSchema)),
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
          "200": jsonResponse("Value set", toSchema(configOverlayPatchResponseSchema)),
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
        security: protectedReadSecurity,
        responses: protectedReadResponses("Secret keys", {
          type: "object",
          properties: { keys: { type: "array", items: { type: "string" } } },
        }),
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
