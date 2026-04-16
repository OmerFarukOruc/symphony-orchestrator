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
  notificationTestResponseSchema,
  notificationsListResponseSchema,
  notificationsReadAllResponseSchema,
  observabilityResponseSchema,
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
    "/api/v1/observability": {
      get: {
        tags: ["State & Metrics"],
        summary: "Get aggregate observability snapshot",
        operationId: "getObservability",
        security: protectedReadSecurity,
        responses: protectedReadResponses("Aggregate observability snapshot", toSchema(observabilityResponseSchema)),
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
    "/api/v1/notifications/test": {
      post: {
        tags: ["Notifications"],
        summary: "Send a test Slack notification using the saved webhook",
        operationId: "sendTestSlackNotification",
        responses: {
          "200": jsonResponse("Test notification dispatched", toSchema(notificationTestResponseSchema)),
          "400": errorResponse("Slack webhook not configured"),
          "403": errorResponse("Slack refused the webhook"),
          "404": errorResponse("Slack rejected the webhook URL"),
          "429": errorResponse("Slack rate limited the request"),
          "502": errorResponse("Slack upstream error"),
          "503": errorResponse("Config store not available"),
          "504": errorResponse("Slack webhook timeout"),
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

/**
 * Codex operator routes proxy to the Codex control plane via JSON-RPC.
 * Responses are opaque JSON objects forwarded from Codex, so schemas use a
 * loose object shape rather than strict Zod types.
 */
const codexOpaqueObject: JsonSchema = { type: "object", additionalProperties: true };

function codexResponse(description: string): Record<string, unknown> {
  return {
    "200": jsonResponse(description, codexOpaqueObject),
    "501": errorResponse("Unsupported Codex control-plane method"),
    "502": errorResponse("Codex control-plane request failed"),
    "503": errorResponse("Codex control plane is unavailable"),
  };
}

export function buildCodexPaths(): Record<string, PathItem> {
  return {
    "/api/v1/codex/capabilities": {
      get: {
        tags: ["Codex"],
        summary: "Get Codex control-plane capabilities",
        operationId: "getCodexCapabilities",
        responses: codexResponse("Codex capability metadata"),
      },
    },
    "/api/v1/codex/admin": {
      get: {
        tags: ["Codex"],
        summary: "Get Codex admin snapshot",
        operationId: "getCodexAdmin",
        responses: codexResponse("Codex admin snapshot"),
      },
    },
    "/api/v1/codex/features": {
      get: {
        tags: ["Codex"],
        summary: "List Codex experimental features",
        operationId: "listCodexFeatures",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500 } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: codexResponse("Experimental feature list"),
      },
    },
    "/api/v1/codex/collaboration-modes": {
      get: {
        tags: ["Codex"],
        summary: "List Codex collaboration modes",
        operationId: "listCodexCollaborationModes",
        responses: codexResponse("Collaboration mode list"),
      },
    },
    "/api/v1/codex/mcp": {
      get: {
        tags: ["Codex"],
        summary: "List MCP servers registered with Codex",
        operationId: "listCodexMcpServers",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500 } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: codexResponse("MCP server status list"),
      },
    },
    "/api/v1/codex/mcp/oauth/login": {
      post: {
        tags: ["Codex"],
        summary: "Begin OAuth login for an MCP server",
        operationId: "loginCodexMcpOauth",
        requestBody: {
          required: true,
          content: jsonContent({
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          }),
        },
        responses: codexResponse("OAuth login initiated"),
      },
    },
    "/api/v1/codex/mcp/reload": {
      post: {
        tags: ["Codex"],
        summary: "Reload MCP server configuration",
        operationId: "reloadCodexMcp",
        responses: codexResponse("MCP configuration reloaded"),
      },
    },
    "/api/v1/codex/threads": {
      get: {
        tags: ["Codex"],
        summary: "List Codex threads",
        operationId: "listCodexThreads",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500 } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          {
            name: "sortKey",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["created_at", "updated_at"] },
          },
          { name: "archived", in: "query", required: false, schema: { type: "boolean" } },
          {
            name: "modelProviders",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Comma-separated provider list",
          },
          {
            name: "sourceKinds",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Comma-separated source-kind list",
          },
        ],
        responses: codexResponse("Thread list"),
      },
    },
    "/api/v1/codex/threads/loaded": {
      get: {
        tags: ["Codex"],
        summary: "List currently loaded Codex threads",
        operationId: "listLoadedCodexThreads",
        responses: codexResponse("Loaded thread list"),
      },
    },
    "/api/v1/codex/threads/{thread_id}": {
      get: {
        tags: ["Codex"],
        summary: "Read a single Codex thread",
        operationId: "readCodexThread",
        parameters: [
          pathParam("thread_id", "Codex thread identifier"),
          { name: "includeTurns", in: "query", required: false, schema: { type: "boolean" } },
        ],
        responses: codexResponse("Thread detail"),
      },
    },
    "/api/v1/codex/threads/{thread_id}/fork": {
      post: {
        tags: ["Codex"],
        summary: "Fork a Codex thread",
        operationId: "forkCodexThread",
        parameters: [pathParam("thread_id", "Codex thread identifier")],
        responses: codexResponse("Fork created"),
      },
    },
    "/api/v1/codex/threads/{thread_id}/name": {
      post: {
        tags: ["Codex"],
        summary: "Rename a Codex thread",
        operationId: "renameCodexThread",
        parameters: [pathParam("thread_id", "Codex thread identifier")],
        requestBody: {
          required: true,
          content: jsonContent({
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          }),
        },
        responses: codexResponse("Thread renamed"),
      },
    },
    "/api/v1/codex/threads/{thread_id}/archive": {
      post: {
        tags: ["Codex"],
        summary: "Archive a Codex thread",
        operationId: "archiveCodexThread",
        parameters: [pathParam("thread_id", "Codex thread identifier")],
        responses: codexResponse("Thread archived"),
      },
    },
    "/api/v1/codex/threads/{thread_id}/unarchive": {
      post: {
        tags: ["Codex"],
        summary: "Unarchive a Codex thread",
        operationId: "unarchiveCodexThread",
        parameters: [pathParam("thread_id", "Codex thread identifier")],
        responses: codexResponse("Thread unarchived"),
      },
    },
    "/api/v1/codex/threads/{thread_id}/unsubscribe": {
      post: {
        tags: ["Codex"],
        summary: "Unsubscribe from a Codex thread",
        operationId: "unsubscribeCodexThread",
        parameters: [pathParam("thread_id", "Codex thread identifier")],
        responses: codexResponse("Unsubscribed"),
      },
    },
    "/api/v1/codex/account": {
      get: {
        tags: ["Codex"],
        summary: "Read the Codex account",
        operationId: "readCodexAccount",
        responses: codexResponse("Account details"),
      },
    },
    "/api/v1/codex/account/rate-limits": {
      get: {
        tags: ["Codex"],
        summary: "Read Codex account rate limits",
        operationId: "readCodexAccountRateLimits",
        responses: codexResponse("Rate-limit snapshot"),
      },
    },
    "/api/v1/codex/account/login/start": {
      post: {
        tags: ["Codex"],
        summary: "Start a Codex account login flow",
        operationId: "startCodexAccountLogin",
        requestBody: {
          required: true,
          content: jsonContent({
            type: "object",
            properties: {
              type: { type: "string" },
              apiKey: { type: "string" },
            },
          }),
        },
        responses: codexResponse("Login flow started"),
      },
    },
    "/api/v1/codex/account/login/cancel": {
      post: {
        tags: ["Codex"],
        summary: "Cancel an in-progress Codex account login",
        operationId: "cancelCodexAccountLogin",
        requestBody: {
          required: true,
          content: jsonContent({
            type: "object",
            properties: { loginId: { type: "string" } },
            required: ["loginId"],
          }),
        },
        responses: codexResponse("Login flow cancelled"),
      },
    },
    "/api/v1/codex/account/logout": {
      post: {
        tags: ["Codex"],
        summary: "Log the Codex account out",
        operationId: "logoutCodexAccount",
        responses: codexResponse("Logged out"),
      },
    },
    "/api/v1/codex/requests/user-input": {
      get: {
        tags: ["Codex"],
        summary: "List pending Codex user-input requests",
        operationId: "listCodexUserInputRequests",
        responses: {
          "200": jsonResponse("Pending user-input requests", {
            type: "object",
            properties: { data: { type: "array", items: codexOpaqueObject } },
          }),
          "503": errorResponse("Codex control plane is unavailable"),
        },
      },
    },
    "/api/v1/codex/requests/user-input/{request_id}/respond": {
      post: {
        tags: ["Codex"],
        summary: "Respond to a pending Codex user-input request",
        operationId: "respondToCodexUserInputRequest",
        parameters: [pathParam("request_id", "Pending request identifier")],
        requestBody: {
          required: true,
          content: jsonContent({
            type: "object",
            properties: { result: {} },
          }),
        },
        responses: {
          "200": jsonResponse("Response accepted", {
            type: "object",
            properties: { ok: { type: "boolean" } },
          }),
          "404": errorResponse("Pending request not found"),
          "503": errorResponse("Codex control plane is unavailable"),
        },
      },
    },
  };
}
