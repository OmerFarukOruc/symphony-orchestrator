import { readFileSync } from "node:fs";
import { join } from "node:path";

import express, { type Express } from "express";

import { createMetricsCollector } from "../observability/metrics.js";
import { validateHttpDeps } from "./dep-validator.js";
import type { HttpRouteDeps } from "./route-types.js";
import { registerExtensionRoutes } from "./routes/extensions.js";
import { registerGitRoutes } from "./routes/git.js";
import { registerIssueRoutes } from "./routes/issues.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerCodexRoutes } from "./routes/codex.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";

const frontendDist = join(process.cwd(), "dist/frontend");

export function registerHttpRoutes(app: Express, deps: HttpRouteDeps): void {
  const staticRoot = deps.frontendDir ?? frontendDist;
  const spaIndexPath = join(staticRoot, "index.html");
  let cachedSpaIndexHtml: string | null = null;
  const routeDeps = {
    ...deps,
    metrics: deps.metrics ?? createMetricsCollector(),
    observability: deps.observability,
  } satisfies HttpRouteDeps;

  validateHttpDeps(routeDeps);

  app.use(express.static(staticRoot));

  registerSystemRoutes(app, routeDeps);
  registerCodexRoutes(app, routeDeps);
  registerExtensionRoutes(app, routeDeps);
  registerGitRoutes(app, routeDeps);
  registerWorkspaceRoutes(app, routeDeps);
  registerNotificationRoutes(app, routeDeps);
  registerIssueRoutes(app, routeDeps);
  registerWebhookRoutes(app, routeDeps);

  // Prevent the SPA catch-all from swallowing unknown webhook paths.
  app.all("/webhooks/*path", (_request, response) => {
    response.status(404).json({ error: { code: "not_found", message: "Not found" } });
  });

  app.use((request, response) => {
    if (request.path.startsWith("/api/") || request.path === "/metrics") {
      response.status(404).json({ error: { code: "not_found", message: "Not found" } });
      return;
    }
    if (cachedSpaIndexHtml === null) {
      cachedSpaIndexHtml = readFileSync(spaIndexPath, "utf8");
    }
    response.type("html").send(cachedSpaIndexHtml);
  });
}
