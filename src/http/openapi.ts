import type { TSchema } from "@sinclair/typebox";

import { schemas, type ErrorEnvelope as SharedErrorEnvelope, type OpenApiDocument } from "@symphony/shared";

function pathParameter(name: string, description: string): Record<string, unknown> {
  return {
    in: "path",
    name,
    required: true,
    description,
    schema: { type: "string" },
  };
}

function bodyRequired(schema: TSchema, description: string): Record<string, unknown> {
  return {
    required: true,
    description,
    content: schemas.jsonContent(schema),
  };
}

function response(description: string, schema: TSchema): Record<string, unknown> {
  return {
    description,
    content: schemas.jsonContent(schema),
  };
}

function noContent(description: string): Record<string, unknown> {
  return { description };
}

export type ErrorEnvelope = SharedErrorEnvelope;

export function buildOpenApiDocument(): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info: {
      title: "Symphony Orchestrator Control Plane API",
      version: process.env.npm_package_version ?? "unknown",
    },
    paths: {
      "/api/v1/state": {
        get: {
          summary: "Get the current orchestrator snapshot",
          responses: {
            "200": response("Current runtime state", schemas.RuntimeSnapshotResponseSchema),
          },
        },
      },
      "/api/v1/runtime": {
        get: {
          summary: "Get runtime metadata",
          responses: {
            "200": response("Runtime metadata", schemas.RuntimeResponseSchema),
          },
        },
      },
      "/metrics": {
        get: {
          summary: "Get Prometheus metrics",
          responses: {
            "200": {
              description: "Prometheus metrics payload",
              content: {
                "text/plain": {
                  schema: { type: "string" },
                },
              },
            },
          },
        },
      },
      "/api/v1/refresh": {
        post: {
          summary: "Queue a refresh pass",
          responses: {
            "202": response("Refresh accepted", schemas.RefreshResponseSchema),
          },
        },
      },
      "/api/v1/transitions": {
        get: {
          summary: "List available state transitions",
          responses: {
            "200": response("Available transitions", schemas.TransitionsResponseSchema),
          },
        },
      },
      "/api/v1/{issue_identifier}": {
        get: {
          summary: "Get issue detail",
          parameters: [pathParameter("issue_identifier", "Issue identifier")],
          responses: {
            "200": response("Issue detail", schemas.IssueDetailSchema),
            "404": response("Unknown issue identifier", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/{issue_identifier}/abort": {
        post: {
          summary: "Abort a running issue",
          parameters: [pathParameter("issue_identifier", "Issue identifier")],
          responses: {
            "200": response("Abort already requested", schemas.AbortResponseSchema),
            "202": response("Abort accepted", schemas.AbortResponseSchema),
            "404": response("Unknown issue identifier", schemas.ErrorEnvelopeSchema),
            "409": response("Abort could not be queued", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/{issue_identifier}/attempts": {
        get: {
          summary: "List archived attempts for an issue",
          parameters: [pathParameter("issue_identifier", "Issue identifier")],
          responses: {
            "200": response("Issue attempts", schemas.AttemptListResponseSchema),
            "404": response("Unknown issue identifier", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/attempts/{attempt_id}": {
        get: {
          summary: "Get a specific attempt detail",
          parameters: [pathParameter("attempt_id", "Attempt identifier")],
          responses: {
            "200": response("Attempt detail", schemas.AttemptDetailSchema),
            "404": response("Unknown attempt identifier", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/{issue_identifier}/model": {
        post: {
          summary: "Override the model selection for an issue",
          parameters: [pathParameter("issue_identifier", "Issue identifier")],
          requestBody: bodyRequired(schemas.ModelUpdateBodySchema, "Model override payload"),
          responses: {
            "202": response("Model override accepted", schemas.ModelUpdateResponseSchema),
            "400": response("Invalid model payload", schemas.ErrorEnvelopeSchema),
            "404": response("Unknown issue identifier", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/{issue_identifier}/transition": {
        post: {
          summary: "Transition an issue to a new state",
          parameters: [pathParameter("issue_identifier", "Issue identifier")],
          requestBody: bodyRequired(schemas.TransitionBodySchema, "Transition target payload"),
          responses: {
            "200": response("Transition applied", schemas.TransitionSuccessResponseSchema),
            "400": response("Missing target state", schemas.ErrorEnvelopeSchema),
            "404": response("Unknown issue identifier", schemas.ErrorEnvelopeSchema),
            "422": response("Transition rejected", schemas.TransitionRejectedResponseSchema),
            "503": response("Linear client unavailable", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/git/context": {
        get: {
          summary: "Get git and GitHub context",
          responses: {
            "200": response("Git context", schemas.GitContextResponseSchema),
          },
        },
      },
      "/api/v1/workspaces": {
        get: {
          summary: "List known workspaces",
          responses: {
            "200": response("Workspace inventory", schemas.WorkspaceInventoryResponseSchema),
            "503": response("Workspace config unavailable", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/workspaces/{workspace_key}": {
        delete: {
          summary: "Remove a workspace",
          parameters: [pathParameter("workspace_key", "Workspace key")],
          responses: {
            "204": noContent("Workspace removed"),
            "400": response("Invalid workspace key", schemas.ErrorEnvelopeSchema),
            "404": response("Workspace not found", schemas.ErrorEnvelopeSchema),
            "409": response("Workspace is still active", schemas.ErrorEnvelopeSchema),
            "503": response("Workspace config unavailable", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/config": {
        get: {
          summary: "Get effective sanitized config",
          responses: {
            "200": response("Effective config", schemas.ConfigValueSchema),
          },
        },
      },
      "/api/v1/config/schema": {
        get: {
          summary: "Get config API schema hints",
          responses: {
            "200": response("Config API schema hints", schemas.ConfigSchemaResponseSchema),
          },
        },
      },
      "/api/v1/config/overlay": {
        get: {
          summary: "Get persisted overlay config",
          responses: {
            "200": response("Config overlay", schemas.ConfigOverlayResponseSchema),
          },
        },
        put: {
          summary: "Apply an overlay patch",
          requestBody: bodyRequired(schemas.ConfigValueSchema, "Overlay patch payload"),
          responses: {
            "200": response("Overlay updated", schemas.ConfigOverlayUpdateResponseSchema),
            "400": response("Invalid overlay payload", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/config/overlay/{path}": {
        patch: {
          summary: "Set a single overlay path",
          parameters: [pathParameter("path", "Overlay path expression")],
          requestBody: bodyRequired(schemas.ConfigOverlayPatchBodySchema, "Path value payload"),
          responses: {
            "200": response("Overlay updated", schemas.ConfigOverlayUpdateResponseSchema),
            "400": response("Invalid overlay payload", schemas.ErrorEnvelopeSchema),
          },
        },
        delete: {
          summary: "Delete a single overlay path",
          parameters: [pathParameter("path", "Overlay path expression")],
          responses: {
            "204": noContent("Overlay path removed"),
            "400": response("Invalid overlay path", schemas.ErrorEnvelopeSchema),
            "404": response("Overlay path not found", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/secrets": {
        get: {
          summary: "List stored secret keys",
          responses: {
            "200": response("Configured secret keys", schemas.SecretListResponseSchema),
          },
        },
      },
      "/api/v1/secrets/{key}": {
        post: {
          summary: "Store a secret value",
          parameters: [pathParameter("key", "Secret key")],
          requestBody: bodyRequired(schemas.SecretValueBodySchema, "Secret payload"),
          responses: {
            "204": noContent("Secret stored"),
            "400": response("Invalid secret payload", schemas.ErrorEnvelopeSchema),
          },
        },
        delete: {
          summary: "Delete a secret",
          parameters: [pathParameter("key", "Secret key")],
          responses: {
            "204": noContent("Secret deleted"),
            "400": response("Invalid secret key", schemas.ErrorEnvelopeSchema),
            "404": response("Secret not found", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/status": {
        get: {
          summary: "Get setup wizard progress",
          responses: {
            "200": response("Setup progress", schemas.SetupStatusResponseSchema),
          },
        },
      },
      "/api/v1/setup/reset": {
        post: {
          summary: "Reset setup state",
          responses: {
            "200": response("Setup reset", schemas.OkResponseSchema),
            "500": response("Reset failed", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/master-key": {
        post: {
          summary: "Initialize or provide the master key",
          requestBody: bodyRequired(schemas.MasterKeyBodySchema, "Optional master key payload"),
          responses: {
            "200": response("Master key initialized", schemas.MasterKeyResponseSchema),
            "409": response("Master key already initialized", schemas.ErrorEnvelopeSchema),
            "500": response("Setup failed", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/linear-projects": {
        get: {
          summary: "List available Linear projects",
          responses: {
            "200": response("Linear projects", schemas.LinearProjectsResponseSchema),
            "400": response("Linear API key missing", schemas.ErrorEnvelopeSchema),
            "502": response("Linear API request failed", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/linear-project": {
        post: {
          summary: "Persist the selected Linear project",
          requestBody: bodyRequired(schemas.LinearProjectSelectionBodySchema, "Selected Linear project payload"),
          responses: {
            "200": response("Project selected", schemas.OkResponseSchema),
            "400": response("Missing project slug", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/openai-key": {
        post: {
          summary: "Validate and store the OpenAI key",
          requestBody: bodyRequired(schemas.ApiKeyBodySchema, "OpenAI API key payload"),
          responses: {
            "200": response("OpenAI key validation result", schemas.TokenValidationResponseSchema),
            "400": response("Missing OpenAI key", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/codex-auth": {
        post: {
          summary: "Store Codex auth.json",
          requestBody: bodyRequired(schemas.CodexAuthBodySchema, "Codex auth payload"),
          responses: {
            "200": response("Codex auth stored", schemas.OkResponseSchema),
            "400": response("Invalid auth payload", schemas.ErrorEnvelopeSchema),
            "500": response("Auth save failed", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/pkce-auth/start": {
        post: {
          summary: "Start PKCE authentication flow",
          responses: {
            "200": response("PKCE flow started", schemas.PkceStartResponseSchema),
            "502": response("Auth endpoint unreachable", schemas.ErrorEnvelopeSchema),
            "500": response("PKCE setup failed", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/pkce-auth/status": {
        get: {
          summary: "Poll PKCE authentication status",
          responses: {
            "200": response("PKCE status", schemas.PkceStatusResponseSchema),
          },
        },
      },
      "/api/v1/setup/pkce-auth/cancel": {
        post: {
          summary: "Cancel PKCE authentication flow",
          responses: {
            "200": response("PKCE flow cancelled", schemas.OkResponseSchema),
          },
        },
      },
      "/api/v1/setup/github-token": {
        post: {
          summary: "Validate and store the GitHub token",
          requestBody: bodyRequired(schemas.GitHubTokenBodySchema, "GitHub token payload"),
          responses: {
            "200": response("GitHub token validation result", schemas.TokenValidationResponseSchema),
            "400": response("Missing GitHub token", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/repo-route": {
        post: {
          summary: "Create or replace a repo route",
          requestBody: bodyRequired(schemas.RepoRouteCreateBodySchema, "Repo route payload"),
          responses: {
            "200": response("Repo route stored", schemas.RepoRouteCreateResponseSchema),
            "400": response("Invalid repo route payload", schemas.ErrorEnvelopeSchema),
          },
        },
        delete: {
          summary: "Delete a repo route by index",
          requestBody: bodyRequired(schemas.RepoRouteDeleteBodySchema, "Repo route delete payload"),
          responses: {
            "200": response("Repo route deleted", schemas.RepoRouteDeleteResponseSchema),
            "400": response("Invalid repo route index", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/repo-routes": {
        get: {
          summary: "List configured repo routes",
          responses: {
            "200": response("Configured repo routes", schemas.RepoRoutesResponseSchema),
          },
        },
      },
      "/api/v1/setup/detect-default-branch": {
        post: {
          summary: "Detect a repository default branch",
          requestBody: bodyRequired(schemas.DetectDefaultBranchBodySchema, "Repository URL payload"),
          responses: {
            "200": response("Detected default branch", schemas.DetectDefaultBranchResponseSchema),
            "400": response("Invalid repository URL", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/create-test-issue": {
        post: {
          summary: "Create a Linear test issue",
          responses: {
            "200": response("Test issue created", schemas.CreateTestIssueResponseSchema),
            "400": response("Missing setup prerequisites", schemas.ErrorEnvelopeSchema),
            "502": response("Linear API request failed", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/create-label": {
        post: {
          summary: "Create the Symphony Linear label",
          responses: {
            "200": response("Label created", schemas.CreateLabelResponseSchema),
            "400": response("Missing setup prerequisites", schemas.ErrorEnvelopeSchema),
            "502": response("Linear API request failed", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/create-project": {
        post: {
          summary: "Create a Linear project",
          requestBody: bodyRequired(schemas.CreateProjectBodySchema, "Project creation payload"),
          responses: {
            "200": response("Project created", schemas.CreateProjectResponseSchema),
            "400": response("Invalid project payload", schemas.ErrorEnvelopeSchema),
            "502": response("Linear API request failed", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/setup/prompt-template": {
        get: {
          summary: "Get the current prompt template",
          responses: {
            "200": response("Prompt template", schemas.PromptTemplateResponseSchema),
          },
        },
        post: {
          summary: "Update the prompt template",
          requestBody: bodyRequired(schemas.PromptTemplateBodySchema, "Prompt template payload"),
          responses: {
            "200": response("Prompt template updated", schemas.PromptTemplateUpdateResponseSchema),
            "400": response("Missing prompt template", schemas.ErrorEnvelopeSchema),
          },
        },
      },
      "/api/v1/events": {
        get: {
          summary: "Subscribe to control-plane invalidation events",
          responses: {
            "200": {
              description: "Server-sent event stream",
              content: {
                "text/event-stream": {
                  schema: { type: "string" },
                },
              },
            },
          },
        },
      },
      "/health": {
        get: {
          summary: "Get data-plane health",
          responses: {
            "200": response("Data-plane health", schemas.DataPlaneHealthSchema),
          },
        },
      },
      "/dispatch": {
        post: {
          summary: "Run a remote dispatch attempt",
          requestBody: bodyRequired(schemas.DispatchRequestSchema, "Dispatch request payload"),
          responses: {
            "200": {
              description: "Dispatch SSE response stream",
              content: {
                "text/event-stream": {
                  schema: { type: "string" },
                },
              },
            },
            "400": response("Invalid dispatch payload", schemas.StringErrorSchema),
            "401": response("Unauthorized dispatch request", schemas.StringErrorSchema),
            "500": response("Dispatch handler error", schemas.StringErrorSchema),
          },
        },
      },
      "/dispatch/{runId}/abort": {
        post: {
          summary: "Abort an active remote dispatch",
          parameters: [pathParameter("runId", "Dispatch run identifier")],
          responses: {
            "200": response("Dispatch aborted", schemas.DispatchAbortResponseSchema),
            "401": response("Unauthorized dispatch request", schemas.StringErrorSchema),
            "404": response("Dispatch run not found", schemas.StringErrorSchema),
          },
        },
      },
    },
  };
}
