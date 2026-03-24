import type { Express } from "express";

import { methodNotAllowed } from "../http/route-helpers.js";
import { handleDeleteRepoRoute, handleGetRepoRoutes, handlePostRepoRoute } from "./repo-route-handlers.js";
import type { SetupApiDeps } from "./setup-handlers.js";
import {
  handleGetLinearProjects,
  handleGetPkceAuthStatus,
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
  handlePostReset,
} from "./setup-handlers.js";

export type { SetupApiDeps } from "./setup-handlers.js";

export function registerSetupApi(app: Express, deps: SetupApiDeps): void {
  app
    .route("/api/v1/setup/status")
    .get(handleGetStatus(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/reset")
    .post(handlePostReset(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/master-key")
    .post(handlePostMasterKey(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/linear-projects")
    .get(handleGetLinearProjects(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/linear-project")
    .post(handlePostLinearProject(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/openai-key")
    .post(handlePostOpenaiKey(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/codex-auth")
    .post(handlePostCodexAuth(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/pkce-auth/start")
    .post(handlePostPkceAuthStart(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/pkce-auth/status")
    .get(handleGetPkceAuthStatus(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/pkce-auth/cancel")
    .post(handlePostPkceAuthCancel(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/github-token")
    .post(handlePostGithubToken(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/create-test-issue")
    .post(handlePostCreateTestIssue(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/create-label")
    .post(handlePostCreateLabel(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/create-project")
    .post(handlePostCreateProject(deps))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/repo-route")
    .post(handlePostRepoRoute({ configOverlayStore: deps.configOverlayStore }))
    .delete(handleDeleteRepoRoute({ configOverlayStore: deps.configOverlayStore }))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/repo-routes")
    .get(handleGetRepoRoutes({ configOverlayStore: deps.configOverlayStore }))
    .all((_req, res) => methodNotAllowed(res));
}
