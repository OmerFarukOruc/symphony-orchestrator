import type { Express } from "express";

import type { HttpRouteDeps } from "../route-types.js";
import { methodNotAllowed } from "../route-helpers.js";
import { handleWorkspaceInventory, handleWorkspaceRemove } from "../workspace-inventory.js";

export function registerWorkspaceRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/workspaces")
    .get(async (req, res) => {
      await handleWorkspaceInventory(
        {
          orchestrator: deps.orchestrator,
          configStore: deps.configStore,
        },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/workspaces/:workspace_key")
    .delete(async (req, res) => {
      await handleWorkspaceRemove(
        {
          orchestrator: deps.orchestrator,
          configStore: deps.configStore,
        },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["DELETE"]);
    });
}
