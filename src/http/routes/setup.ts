import type { Express } from "express";

import { methodNotAllowed } from "../errors.js";
import { getSetupService } from "../../setup/setup-service.js";
import { handleDetectDefaultBranch } from "../../setup/detect-default-branch.js";
import { handleDeleteRepoRoute, handleGetRepoRoutes, handlePostRepoRoute } from "../../setup/repo-route-handlers.js";
import type { SetupApiDeps } from "../../setup/setup-handlers.js";
import {
  handleGetLinearProjects,
  handleGetPkceAuthStatus,
  handleGetStatus,
  handlePostCodexAuth,
  handlePostCreateLabel,
  handlePostCreateProject,
  handlePostCreateTestIssue,
  handlePostGithubToken,
  handlePostLinearProject,
  handlePostMasterKey,
  handlePostOpenaiKey,
  handlePostPkceAuthCancel,
  handlePostPkceAuthStart,
  handlePostReset,
} from "../../setup/setup-handlers.js";

export type { SetupApiDeps } from "../../setup/setup-handlers.js";

export function registerSetupApi(app: Express, deps: SetupApiDeps): void {
  const service = getSetupService(deps);

  app
    .route("/api/v1/setup/status")
    .get(handleGetStatus(service))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/reset")
    .post(handlePostReset(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/master-key")
    .post(handlePostMasterKey(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/linear-projects")
    .get(handleGetLinearProjects(service))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/linear-project")
    .post(handlePostLinearProject(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/openai-key")
    .post(handlePostOpenaiKey(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/codex-auth")
    .post(handlePostCodexAuth(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/pkce-auth/start")
    .post(handlePostPkceAuthStart(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/pkce-auth/status")
    .get(handleGetPkceAuthStatus(service))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/pkce-auth/cancel")
    .post(handlePostPkceAuthCancel(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/github-token")
    .post(handlePostGithubToken(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/create-test-issue")
    .post(handlePostCreateTestIssue(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/create-label")
    .post(handlePostCreateLabel(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/create-project")
    .post(handlePostCreateProject(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/repo-route")
    .post(handlePostRepoRoute(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));

  app
    .route("/api/v1/setup/repo-route/:index")
    .delete(handleDeleteRepoRoute(service))
    .all((_req, res) => methodNotAllowed(res, ["DELETE"]));

  app
    .route("/api/v1/setup/repo-routes")
    .get(handleGetRepoRoutes(service))
    .all((_req, res) => methodNotAllowed(res));

  app
    .route("/api/v1/setup/detect-default-branch")
    .post(handleDetectDefaultBranch(service))
    .all((_req, res) => methodNotAllowed(res, ["POST"]));
}
