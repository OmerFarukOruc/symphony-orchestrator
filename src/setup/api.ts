import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { Express } from "express";

import type { ConfigOverlayStore } from "../config/overlay.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import { methodNotAllowed } from "../http/route-helpers.js";
import type { SecretsStore } from "../secrets/store.js";
import { isRecord } from "../utils/type-guards.js";

interface SetupApiDeps {
  secretsStore: SecretsStore;
  configOverlayStore: ConfigOverlayStore;
  orchestrator: Orchestrator;
  archiveDir: string;
}

export function registerSetupApi(app: Express, deps: SetupApiDeps): void {
  // GET /api/v1/setup/status
  app
    .route("/api/v1/setup/status")
    .get((_req, res) => {
      const masterKeyDone = deps.secretsStore.isInitialized();
      const linearProjectDone = !!(deps.secretsStore.get("LINEAR_API_KEY") || process.env.LINEAR_API_KEY);
      const githubTokenDone = !!(deps.secretsStore.get("GITHUB_TOKEN") || process.env.GITHUB_TOKEN);

      res.json({
        configured: masterKeyDone && linearProjectDone,
        steps: {
          masterKey: { done: masterKeyDone },
          linearProject: { done: linearProjectDone },
          githubToken: { done: githubTokenDone },
        },
      });
    })
    .all((_req, res) => methodNotAllowed(res));

  // POST /api/v1/setup/master-key
  app
    .route("/api/v1/setup/master-key")
    .post(async (req, res) => {
      const body = req.body;
      const providedKey = isRecord(body) && typeof body.key === "string" && body.key ? body.key : null;
      const key = providedKey ?? randomBytes(32).toString("hex");

      try {
        const keyFile = path.join(deps.archiveDir, "master.key");
        await writeFile(keyFile, key, { encoding: "utf8", mode: 0o600 });
        await deps.secretsStore.initializeWithKey(key);
        res.json({ key });
      } catch (error) {
        res.status(500).json({ error: { code: "setup_error", message: String(error) } });
      }
    })
    .all((_req, res) => methodNotAllowed(res));

  // GET /api/v1/setup/linear-projects
  app
    .route("/api/v1/setup/linear-projects")
    .get(async (_req, res) => {
      const apiKey = deps.secretsStore.get("LINEAR_API_KEY") ?? process.env.LINEAR_API_KEY ?? "";
      if (!apiKey) {
        res.status(400).json({ error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" } });
        return;
      }

      const query = `{ projects(first: 50) { nodes { id name slugId teams { nodes { key } } } } }`;
      let response: globalThis.Response;
      try {
        response = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: apiKey },
          body: JSON.stringify({ query }),
        });
      } catch (error) {
        res.status(502).json({ error: { code: "linear_api_error", message: String(error) } });
        return;
      }

      if (!response.ok) {
        res
          .status(502)
          .json({ error: { code: "linear_api_error", message: `Linear API returned ${response.status}` } });
        return;
      }

      const data = (await response.json()) as { data?: { projects?: { nodes?: unknown[] } } };
      const nodes = data.data?.projects?.nodes ?? [];
      const projects = nodes.map((n: unknown) => {
        const node = n as Record<string, unknown>;
        const teams = node.teams as { nodes?: Array<{ key: string }> } | undefined;
        return {
          id: node.id,
          name: node.name,
          slugId: node.slugId,
          teamKey: teams?.nodes?.[0]?.key ?? null,
        };
      });

      res.json({ projects });
    })
    .all((_req, res) => methodNotAllowed(res));

  // POST /api/v1/setup/linear-project
  app
    .route("/api/v1/setup/linear-project")
    .post(async (req, res) => {
      const body = req.body;
      const slugId = isRecord(body) && typeof body.slugId === "string" ? body.slugId : null;
      if (!slugId) {
        res.status(400).json({ error: { code: "missing_slug_id", message: "slugId is required" } });
        return;
      }

      await deps.configOverlayStore.set("tracker.project_slug", slugId);
      deps.orchestrator.requestRefresh("setup");

      res.json({ ok: true });
    })
    .all((_req, res) => methodNotAllowed(res));

  // POST /api/v1/setup/github-token
  app
    .route("/api/v1/setup/github-token")
    .post(async (req, res) => {
      const body = req.body;
      const token = isRecord(body) && typeof body.token === "string" ? body.token : null;
      if (!token) {
        res.status(400).json({ error: { code: "missing_token", message: "token is required" } });
        return;
      }

      let valid: boolean;
      try {
        const ghResponse = await fetch("https://api.github.com/user", {
          headers: { authorization: `token ${token}`, "user-agent": "Symphony-Orchestrator" },
        });
        valid = ghResponse.ok;
      } catch {
        valid = false;
      }

      if (valid) {
        await deps.secretsStore.set("GITHUB_TOKEN", token);
      }

      res.json({ valid });
    })
    .all((_req, res) => methodNotAllowed(res));
}
