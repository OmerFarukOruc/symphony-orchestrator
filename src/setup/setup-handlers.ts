import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import type { Request, Response } from "express";

import { normalizeCodexAuthJson } from "../codex/auth-file.js";
import type { ConfigOverlayStore } from "../config/overlay.js";
import {
  buildCreateIssueMutation,
  buildCreateLabelMutation,
  buildCreateProjectMutation,
  buildProjectLookupQuery,
  buildTeamStatesQuery,
  buildTeamsQuery,
} from "../linear/queries.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import type { SecretsStore } from "../secrets/store.js";
import { getErrorMessage, isRecord } from "../utils/type-guards.js";
import {
  checkAuthEndpointReachable,
  createPkceSession,
  exchangePkceCode,
  savePkceAuthTokens,
  shutdownCallbackServer,
  startCallbackServer,
  type PkceSession,
} from "./device-auth.js";
import { hasCodexAuthFile, hasLinearCredentials, hasRepoRoutes, readProjectSlug } from "./setup-status.js";

export interface SetupApiDeps {
  secretsStore: SecretsStore;
  configOverlayStore: ConfigOverlayStore;
  orchestrator: Orchestrator;
  archiveDir: string;
}

export function handleGetStatus(deps: SetupApiDeps) {
  return (_req: Request, res: Response) => {
    const masterKeyDone = deps.secretsStore.isInitialized();
    const linearProjectDone = hasLinearCredentials(deps.secretsStore);
    const hasApiKey = !!(deps.secretsStore.get("OPENAI_API_KEY") || process.env.OPENAI_API_KEY);
    const hasAuthJson = hasCodexAuthFile(deps.archiveDir, deps.configOverlayStore.toMap());
    const openaiKeyDone = hasApiKey || hasAuthJson;
    const githubTokenDone = !!(deps.secretsStore.get("GITHUB_TOKEN") || process.env.GITHUB_TOKEN);

    res.json({
      configured: masterKeyDone && linearProjectDone,
      steps: {
        masterKey: { done: masterKeyDone },
        linearProject: { done: linearProjectDone },
        repoRoute: { done: hasRepoRoutes(deps.configOverlayStore.toMap()) },
        openaiKey: { done: openaiKeyDone },
        githubToken: { done: githubTokenDone },
      },
    });
  };
}

export function handlePostReset(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    try {
      await deps.orchestrator.stop();
      await Promise.all(deps.secretsStore.list().map((key) => deps.secretsStore.delete(key)));
      delete process.env.GITHUB_TOKEN;
      await Promise.all([
        deps.configOverlayStore.set("codex.auth.mode", ""),
        deps.configOverlayStore.set("codex.auth.source_home", ""),
        deps.configOverlayStore.delete("codex.provider"),
        writeFile(path.join(deps.archiveDir, "master.key"), "", { encoding: "utf8", mode: 0o600 }),
      ]);
      deps.secretsStore.reset();
      res.json({ ok: true });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to reset configuration");
      res.status(500).json({ error: { code: "reset_failed", message } });
    }
  };
}

export function handlePostMasterKey(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    if (deps.secretsStore.isInitialized()) {
      res.status(409).json({ error: { code: "already_initialized", message: "Master key is already set" } });
      return;
    }

    const body = req.body;
    const providedKey = isRecord(body) && typeof body.key === "string" && body.key ? body.key : null;
    const key = providedKey ?? randomBytes(32).toString("hex");

    try {
      const keyFile = path.join(deps.archiveDir, "master.key");
      await mkdir(deps.archiveDir, { recursive: true });
      await writeFile(keyFile, key, { encoding: "utf8", mode: 0o600 });
      await deps.secretsStore.initializeWithKey(key);
      res.json({ key });
    } catch (error) {
      res.status(500).json({ error: { code: "setup_error", message: String(error) } });
    }
  };
}

export function handleGetLinearProjects(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
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
      res.status(502).json({ error: { code: "linear_api_error", message: `Linear API returned ${response.status}` } });
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
  };
}

export function handlePostLinearProject(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
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
  };
}

export function handlePostOpenaiKey(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
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
      await Promise.all([
        deps.secretsStore.set("OPENAI_API_KEY", key),
        deps.configOverlayStore.set("codex.auth.mode", "api_key"),
        deps.configOverlayStore.set("codex.provider.name", "CLIProxyAPI"),
        deps.configOverlayStore.set("codex.provider.base_url", "http://localhost:8317/v1"),
        deps.configOverlayStore.set("codex.provider.env_key", "OPENAI_API_KEY"),
        deps.configOverlayStore.set("codex.provider.wire_api", "responses"),
      ]);
    }

    res.json({ valid });
  };
}

export function handlePostCodexAuth(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
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
      const normalizedAuthJson = normalizeCodexAuthJson(authJson);
      const authDir = path.join(deps.archiveDir, "codex-auth");
      await mkdir(authDir, { recursive: true });
      await writeFile(path.join(authDir, "auth.json"), normalizedAuthJson, { encoding: "utf8", mode: 0o600 });

      await Promise.all([
        deps.configOverlayStore.set("codex.auth.mode", "openai_login"),
        deps.configOverlayStore.set("codex.auth.source_home", authDir),
        deps.configOverlayStore.delete("codex.provider"),
      ]);

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: { code: "save_error", message: String(error) } });
    }
  };
}

let activePkceSession: PkceSession | null = null;

export function handlePostPkceAuthStart(_deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    try {
      // Pre-flight: verify OpenAI auth endpoint is reachable
      const reachError = await checkAuthEndpointReachable();
      if (reachError) {
        res.status(502).json({ error: { code: "auth_unreachable", message: reachError } });
        return;
      }

      // Shut down any previous session
      if (activePkceSession) {
        shutdownCallbackServer(activePkceSession);
      }

      activePkceSession = createPkceSession("");
      await startCallbackServer(activePkceSession);
      res.json({ authUrl: activePkceSession.authUrl });
    } catch (error) {
      const message = activePkceSession?.error ?? String(error);
      res.status(500).json({ error: { code: "pkce_start_error", message } });
    }
  };
}

export function handleGetPkceAuthStatus(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    if (!activePkceSession) {
      res.json({ status: "idle" });
      return;
    }
    if (activePkceSession.error) {
      shutdownCallbackServer(activePkceSession);
      res.json({ status: "error", error: activePkceSession.error });
      return;
    }
    if (activePkceSession.complete) {
      res.json({ status: "complete" });
      return;
    }
    // Check if auth code was received — exchange it for tokens
    if (activePkceSession.authCode) {
      await exchangeAndSaveFromSession(activePkceSession, deps, res);
      return;
    }
    // Check if session expired (3 min timeout)
    if (Date.now() - activePkceSession.createdAt > 3 * 60 * 1000) {
      activePkceSession.error = "Authentication timed out. Please try again.";
      shutdownCallbackServer(activePkceSession);
      res.json({ status: "expired", error: activePkceSession.error });
      return;
    }
    res.json({ status: "pending" });
  };
}

async function exchangeAndSaveFromSession(session: PkceSession, deps: SetupApiDeps, res: Response): Promise<void> {
  try {
    const tokenData = await exchangePkceCode(session.authCode!, session.codeVerifier, session.redirectUri);
    await savePkceAuthTokens(tokenData, deps.archiveDir, deps.configOverlayStore);
    session.complete = true;
    shutdownCallbackServer(session);
    res.json({ status: "complete" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.error = message;
    shutdownCallbackServer(session);
    res.json({ status: "error", error: message });
  }
}

export function handlePostPkceAuthCancel(_deps: SetupApiDeps) {
  return (_req: Request, res: Response) => {
    if (activePkceSession) {
      shutdownCallbackServer(activePkceSession);
      activePkceSession = null;
    }
    res.json({ ok: true });
  };
}

export function handlePostGithubToken(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
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
      process.env.GITHUB_TOKEN = token;
    }

    res.json({ valid });
  };
}

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

interface LinearGraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

async function callLinearGraphQL(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<LinearGraphQLResponse> {
  const response = await fetch(LINEAR_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Linear API returned ${response.status}: ${body}`);
  }

  const data = (await response.json()) as LinearGraphQLResponse;
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join("; "));
  }

  return data;
}

function getLinearApiKey(deps: SetupApiDeps): string {
  return deps.secretsStore.get("LINEAR_API_KEY") ?? process.env.LINEAR_API_KEY ?? "";
}

interface ProjectNode {
  id: string;
  name: string;
  slugId: string;
  teams?: { nodes?: Array<{ id: string; key: string }> };
}

async function lookupProject(apiKey: string, projectSlug: string): Promise<ProjectNode> {
  const data = await callLinearGraphQL(apiKey, buildProjectLookupQuery(), { projectSlug });
  const nodes = ((data.data as Record<string, unknown>)?.projects as Record<string, unknown>)?.nodes as
    | ProjectNode[]
    | undefined;
  const project = nodes?.[0];
  if (!project) {
    throw new Error(`Project "${projectSlug}" not found`);
  }
  return project;
}

async function lookupInProgressStateId(apiKey: string, teamId: string): Promise<string> {
  const data = await callLinearGraphQL(apiKey, buildTeamStatesQuery(), { teamId });
  const states = ((data.data as Record<string, unknown>)?.team as Record<string, unknown>)?.states as
    | { nodes?: Array<{ id: string; name: string }> }
    | undefined;
  const inProgress = states?.nodes?.find((s) => s.name.toLowerCase() === "in progress");
  if (!inProgress) {
    throw new Error('No "In Progress" state found for the team');
  }
  return inProgress.id;
}

async function createTestIssue(apiKey: string, projectSlug: string): Promise<{ identifier: string; url: string }> {
  const project = await lookupProject(apiKey, projectSlug);
  const teamId = project.teams?.nodes?.[0]?.id;
  if (!teamId) {
    throw new Error("No team found for the selected project");
  }

  const stateId = await lookupInProgressStateId(apiKey, teamId);
  const data = await callLinearGraphQL(apiKey, buildCreateIssueMutation(), {
    teamId,
    projectId: project.id,
    title: "Symphony smoke test",
    description:
      "This issue was created automatically to verify your Symphony setup. " +
      "Symphony should pick it up within one poll cycle and run a sandboxed agent.",
    stateId,
  });

  const result = (data.data as Record<string, unknown>)?.issueCreate as
    | { success?: boolean; issue?: { identifier?: string; url?: string } }
    | undefined;

  if (!result?.success || !result.issue?.identifier || !result.issue?.url) {
    throw new Error("Linear did not confirm issue creation");
  }

  return { identifier: result.issue.identifier, url: result.issue.url };
}

async function createSymphonyLabel(
  apiKey: string,
  projectSlug: string,
): Promise<{ id: string; name: string; alreadyExists: boolean }> {
  const project = await lookupProject(apiKey, projectSlug);
  const teamId = project.teams?.nodes?.[0]?.id;
  if (!teamId) {
    throw new Error("No team found for the selected project");
  }

  let data: LinearGraphQLResponse;
  try {
    data = await callLinearGraphQL(apiKey, buildCreateLabelMutation(), {
      teamId,
      name: "symphony",
      color: "#2563eb",
    });
  } catch (error) {
    const message = getErrorMessage(error, "");
    if (message.toLowerCase().includes("duplicate")) {
      return { id: "", name: "symphony", alreadyExists: true };
    }
    throw error;
  }

  const result = (data.data as Record<string, unknown>)?.issueLabelCreate as
    | { success?: boolean; issueLabel?: { id?: string; name?: string } }
    | undefined;

  if (!result?.success || !result.issueLabel?.id || !result.issueLabel?.name) {
    throw new Error("Linear did not confirm label creation");
  }

  return { id: result.issueLabel.id, name: result.issueLabel.name, alreadyExists: false };
}

export function handlePostCreateTestIssue(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    const apiKey = getLinearApiKey(deps);
    if (!apiKey) {
      res.status(400).json({ error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" } });
      return;
    }

    const overlay = deps.configOverlayStore.toMap();
    const projectSlug = readProjectSlug(overlay);
    if (!projectSlug) {
      res.status(400).json({ error: { code: "missing_project", message: "No Linear project selected" } });
      return;
    }

    try {
      const { identifier, url } = await createTestIssue(apiKey, projectSlug);
      res.json({ ok: true, issueIdentifier: identifier, issueUrl: url });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to create test issue");
      res.status(502).json({ error: { code: "linear_api_error", message } });
    }
  };
}

export function handlePostCreateLabel(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    const apiKey = getLinearApiKey(deps);
    if (!apiKey) {
      res.status(400).json({ error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" } });
      return;
    }

    const overlay = deps.configOverlayStore.toMap();
    const projectSlug = readProjectSlug(overlay);
    if (!projectSlug) {
      res.status(400).json({ error: { code: "missing_project", message: "No Linear project selected" } });
      return;
    }

    try {
      const { id, name, alreadyExists } = await createSymphonyLabel(apiKey, projectSlug);
      res.json({ ok: true, labelId: id, labelName: name, alreadyExists });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to create label");
      res.status(502).json({ error: { code: "linear_api_error", message } });
    }
  };
}

interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

interface ProjectCreateResult {
  success?: boolean;
  project?: {
    id?: string;
    name?: string;
    slugId?: string;
    url?: string;
    teams?: { nodes?: Array<{ key: string }> };
  };
}

async function fetchLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const teamsData = await callLinearGraphQL(apiKey, buildTeamsQuery(), {});
  return (
    (((teamsData.data as Record<string, unknown>)?.teams as Record<string, unknown>)?.nodes as
      | LinearTeam[]
      | undefined) ?? []
  );
}

async function createLinearProject(apiKey: string, name: string, teamIds: string[]): Promise<ProjectCreateResult> {
  const data = await callLinearGraphQL(apiKey, buildCreateProjectMutation(), { name, teamIds });
  return ((data.data as Record<string, unknown>)?.projectCreate as ProjectCreateResult | undefined) ?? {};
}

function parseProjectName(body: unknown): string | null {
  if (!isRecord(body) || typeof body.name !== "string") return null;
  const name = body.name.trim();
  return name || null;
}

export function handlePostCreateProject(deps: SetupApiDeps) {
  return async (req: Request, res: Response) => {
    const apiKey = getLinearApiKey(deps);
    if (!apiKey) {
      res.status(400).json({ error: { code: "missing_api_key", message: "LINEAR_API_KEY not configured" } });
      return;
    }

    const name = parseProjectName(req.body);
    if (!name) {
      res.status(400).json({ error: { code: "missing_name", message: "Project name is required" } });
      return;
    }

    try {
      const teams = await fetchLinearTeams(apiKey);
      if (!teams.length) {
        res.status(400).json({ error: { code: "no_teams", message: "No teams found in your Linear workspace" } });
        return;
      }

      const result = await createLinearProject(apiKey, name, [teams[0].id]);
      if (!result?.success || !result.project?.slugId) {
        throw new Error("Linear did not confirm project creation");
      }

      res.json({
        ok: true,
        project: {
          id: result.project.id,
          name: result.project.name,
          slugId: result.project.slugId,
          url: result.project.url ?? null,
          teamKey: result.project.teams?.nodes?.[0]?.key ?? teams[0].key,
        },
      });
    } catch (error) {
      const message = getErrorMessage(error, "Failed to create project");
      res.status(502).json({ error: { code: "linear_api_error", message } });
    }
  };
}
