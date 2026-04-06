import type { Express } from "express";

import type { HttpRouteDeps } from "../route-types.js";
import { handleGitContext } from "../git-context.js";
import { handleListPrs } from "../pr-handler.js";
import { methodNotAllowed } from "../route-helpers.js";

export function registerGitRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/prs")
    .get(async (req, res) => {
      await handleListPrs({ attemptStore: deps.attemptStore }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/git/context")
    .get(async (req, res) => {
      await handleGitContext(
        {
          orchestrator: deps.orchestrator,
          configStore: deps.configStore,
          secretsStore: deps.secretsStore,
        },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}
