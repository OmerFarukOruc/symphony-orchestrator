import type { FastifyInstance } from "fastify";

import { handleDetectDefaultBranch } from "./detect-default-branch.js";
import { handleDeleteRepoRoute, handleGetRepoRoutes, handlePostRepoRoute } from "./repo-route-handlers.js";
import type { SetupApiDeps } from "./setup-handlers.js";
import {
  handleGetLinearProjects,
  handleGetPkceAuthStatus,
  handleGetPromptTemplate,
  handleGetStatus,
  handlePostPkceAuthCancel,
  handlePostCodexAuth,
  handlePostCreateLabel,
  handlePostCreateProject,
  handlePostCreateTestIssue,
  handlePostGithubToken,
  handlePostLinearProject,
  handlePostMasterKey,
  handlePostOpenaiKey,
  handlePostPkceAuthStart,
  handlePostPromptTemplate,
  handlePostReset,
} from "./setup-handlers.js";

export type { SetupApiDeps } from "./setup-handlers.js";

export function registerSetupApi(app: FastifyInstance, deps: SetupApiDeps): void {
  app.get("/api/v1/setup/status", handleGetStatus(deps));
  app.post("/api/v1/setup/reset", handlePostReset(deps));
  app.post("/api/v1/setup/master-key", handlePostMasterKey(deps));
  app.get("/api/v1/setup/linear-projects", handleGetLinearProjects(deps));
  app.post("/api/v1/setup/linear-project", handlePostLinearProject(deps));
  app.post("/api/v1/setup/openai-key", handlePostOpenaiKey(deps));
  app.post("/api/v1/setup/codex-auth", handlePostCodexAuth(deps));
  app.post("/api/v1/setup/pkce-auth/start", handlePostPkceAuthStart(deps));
  app.get("/api/v1/setup/pkce-auth/status", handleGetPkceAuthStatus(deps));
  app.post("/api/v1/setup/pkce-auth/cancel", handlePostPkceAuthCancel(deps));
  app.post("/api/v1/setup/github-token", handlePostGithubToken(deps));
  app.post("/api/v1/setup/create-test-issue", handlePostCreateTestIssue(deps));
  app.post("/api/v1/setup/create-label", handlePostCreateLabel(deps));
  app.post("/api/v1/setup/create-project", handlePostCreateProject(deps));
  app.post("/api/v1/setup/repo-route", handlePostRepoRoute({ configOverlayStore: deps.configOverlayStore }));
  app.delete("/api/v1/setup/repo-route", handleDeleteRepoRoute({ configOverlayStore: deps.configOverlayStore }));
  app.get("/api/v1/setup/repo-routes", handleGetRepoRoutes({ configOverlayStore: deps.configOverlayStore }));
  app.post("/api/v1/setup/detect-default-branch", handleDetectDefaultBranch({ secretsStore: deps.secretsStore }));
  app.get("/api/v1/setup/prompt-template", handleGetPromptTemplate(deps));
  app.post("/api/v1/setup/prompt-template", handlePostPromptTemplate(deps));
}
