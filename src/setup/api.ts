import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Express } from "express";

import type { ConfigOverlayStore } from "../config/overlay.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import { methodNotAllowed } from "../http/route-helpers.js";
import type { SecretsStore } from "../secrets/store.js";
import { isRecord } from "../utils/type-guards.js";
import { pollDeviceAuth, saveDeviceAuthTokens, startDeviceAuth } from "./device-auth.js";

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
      const hasApiKey = !!(deps.secretsStore.get("OPENAI_API_KEY") || process.env.OPENAI_API_KEY);
      const hasAuthJson = existsSync(path.join(deps.archiveDir, "codex-auth", "auth.json"));
      const openaiKeyDone = hasApiKey || hasAuthJson;
      const githubTokenDone = !!(deps.secretsStore.get("GITHUB_TOKEN") || process.env.GITHUB_TOKEN);

      res.json({
        configured: masterKeyDone && linearProjectDone,
        steps: {
          masterKey: { done: masterKeyDone },
          linearProject: { done: linearProjectDone },
          openaiKey: { done: openaiKeyDone },
          githubToken: { done: githubTokenDone },
        },
      });
    })
    .all((_req, res) => methodNotAllowed(res));

  // POST /api/v1/setup/master-key
  app
    .route("/api/v1/setup/master-key")
    .post(async (req, res) => {
      if (deps.secretsStore.isInitialized()) {
        res.status(409).json({ error: { code: "already_initialized", message: "Master key is already set" } });
        return;
      }

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
      await deps.orchestrator.start();
      deps.orchestrator.requestRefresh("setup");

      res.json({ ok: true });
    })
    .all((_req, res) => methodNotAllowed(res));

  // POST /api/v1/setup/openai-key
  app
    .route("/api/v1/setup/openai-key")
    .post(async (req, res) => {
      const body = req.body;
      const key = isRecord(body) && typeof body.key === "string" ? body.key : null;
      if (!key) {
        res.status(400).json({ error: { code: "missing_key", message: "key is required" } });
        return;
      }

      let valid: boolean;
      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/models", {
          headers: { authorization: `Bearer ${key}` },
        });
        valid = openaiResponse.ok;
      } catch {
        valid = false;
      }

      if (valid) {
        await deps.secretsStore.set("OPENAI_API_KEY", key);
      }

      res.json({ valid });
    })
    .all((_req, res) => methodNotAllowed(res));

  // POST /api/v1/setup/codex-auth
  app
    .route("/api/v1/setup/codex-auth")
    .post(async (req, res) => {
      const body = req.body;
      const authJson = isRecord(body) && typeof body.authJson === "string" ? body.authJson : null;
      if (!authJson) {
        res.status(400).json({ error: { code: "missing_auth_json", message: "authJson is required" } });
        return;
      }

      try {
        JSON.parse(authJson);
      } catch {
        res.status(400).json({ error: { code: "invalid_json", message: "authJson must be valid JSON" } });
        return;
      }

      try {
        const authDir = path.join(deps.archiveDir, "codex-auth");
        await mkdir(authDir, { recursive: true });
        await writeFile(path.join(authDir, "auth.json"), authJson, { encoding: "utf8", mode: 0o600 });

        await deps.configOverlayStore.set("codex.auth.mode", "openai_login");
        await deps.configOverlayStore.set("codex.auth.source_home", authDir);

        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: { code: "save_error", message: String(error) } });
      }
    })
    .all((_req, res) => methodNotAllowed(res));

  // POST /api/v1/setup/device-auth/start
  app
    .route("/api/v1/setup/device-auth/start")
    .post(async (_req, res) => {
      try {
        const result = await startDeviceAuth();
        res.json({
          userCode: result.user_code,
          verificationUri: result.verification_uri_complete || result.verification_uri,
          deviceCode: result.device_code,
          expiresIn: result.expires_in,
          interval: result.interval,
        });
      } catch (error) {
        res.status(502).json({ error: { code: "device_auth_error", message: String(error) } });
      }
    })
    .all((_req, res) => methodNotAllowed(res));

  // POST /api/v1/setup/device-auth/poll
  app
    .route("/api/v1/setup/device-auth/poll")
    .post(async (req, res) => {
      const body = req.body;
      const deviceCode = isRecord(body) && typeof body.deviceCode === "string" ? body.deviceCode : null;
      if (!deviceCode) {
        res.status(400).json({ error: { code: "missing_device_code", message: "deviceCode is required" } });
        return;
      }

      try {
        const pollResult = await pollDeviceAuth(deviceCode);
        if (pollResult.status === "complete") {
          const saveResult = await saveDeviceAuthTokens(deviceCode, deps.archiveDir, deps.configOverlayStore);
          if (!saveResult.ok) {
            res.json({ status: "error", error: saveResult.error });
            return;
          }
        }
        res.json(pollResult);
      } catch (error) {
        res.status(500).json({ error: { code: "poll_error", message: String(error) } });
      }
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
