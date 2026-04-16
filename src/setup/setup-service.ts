import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import {
  buildCreateIssueMutation,
  buildCreateLabelMutation,
  buildCreateProjectMutation,
  buildTeamStatesQuery,
  buildTeamsQuery,
} from "../linear/queries.js";
import { normalizeCodexAuthJson } from "../codex/auth-file.js";
import {
  checkAuthEndpointReachable,
  createPkceSession,
  exchangePkceCode,
  savePkceAuthTokens,
  shutdownCallbackServer,
  startCallbackServer,
  type PkceSession,
} from "./device-auth.js";
import { hasCodexAuthFile, hasRepoRoutes, readProjectSlug } from "./setup-status.js";
import {
  callLinearGraphQL,
  getLinearApiKey,
  lookupProject,
  type LinearGraphQLResponse,
  type SetupApiDeps,
} from "./handlers/shared.js";

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

const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/u;

export interface SetupStatusSnapshot {
  configured: boolean;
  steps: {
    masterKey: { done: boolean };
    linearProject: { done: boolean };
    repoRoute: { done: boolean };
    openaiKey: { done: boolean };
    githubToken: { done: boolean };
  };
}

export interface LinearProjectOption {
  id: unknown;
  name: unknown;
  slugId: unknown;
  teamKey: string | null;
}

export interface SetupProviderConfig {
  supplied: boolean;
  name: string | null;
  baseUrl: string | null;
}

export interface RepoRouteEntry {
  repo_url: string;
  default_branch: string;
  identifier_prefix: string;
  label?: string;
}

export interface SaveRepoRouteInput {
  repoUrl: string | null;
  defaultBranch?: string | null;
  identifierPrefix: string | null;
  label?: string | null;
}

export class SetupServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SetupServiceError";
  }
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.at(end - 1) === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_BRANCH_FALLBACK = "main";

export function trimOptionalNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRepos(overlay: Record<string, unknown>): RepoRouteEntry[] {
  const raw = overlay.repos;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (entry): entry is RepoRouteEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as RepoRouteEntry).repo_url === "string" &&
      typeof (entry as RepoRouteEntry).identifier_prefix === "string",
  );
}

function normalizeRepoUrl(repoUrl: string | null): string | null {
  const url = trimOptionalNonEmptyString(repoUrl);
  if (!url || !GITHUB_URL_RE.test(url)) {
    return null;
  }
  return url;
}

function normalizeDefaultBranch(defaultBranch: string | null | undefined): string {
  return trimOptionalNonEmptyString(defaultBranch) ?? "main";
}

function normalizeIdentifierPrefix(identifierPrefix: string | null): string | null {
  const prefix = trimOptionalNonEmptyString(identifierPrefix);
  return prefix ? prefix.toUpperCase() : null;
}

function normalizeLabel(label: string | null | undefined): string | undefined {
  return trimOptionalNonEmptyString(label) ?? undefined;
}

function getValidationUrl(baseUrl: string | null): string {
  return baseUrl ? `${stripTrailingSlashes(baseUrl)}/models` : "https://api.openai.com/v1/models";
}

async function validateOpenaiKey(key: string, validationUrl: string): Promise<boolean> {
  try {
    const openaiResponse = await fetch(validationUrl, {
      headers: { authorization: `Bearer ${key}` },
    });
    return openaiResponse.ok;
  } catch {
    return false;
  }
}

async function fetchLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const teamsData = await callLinearGraphQL(apiKey, buildTeamsQuery(), {});
  return ((teamsData.data?.teams as Record<string, unknown> | undefined)?.nodes as LinearTeam[] | undefined) ?? [];
}

async function createLinearProject(apiKey: string, name: string, teamIds: string[]): Promise<ProjectCreateResult> {
  const data = await callLinearGraphQL(apiKey, buildCreateProjectMutation(), { name, teamIds });
  return (data.data?.projectCreate as ProjectCreateResult | undefined) ?? {};
}

async function createRisolutoLabel(
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
      name: "risoluto",
      color: "#2563eb",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("duplicate")) {
      return { id: "", name: "risoluto", alreadyExists: true };
    }
    throw error;
  }

  const result = data.data?.issueLabelCreate as
    | { success?: boolean; issueLabel?: { id?: string; name?: string } }
    | undefined;

  if (!result?.success || !result.issueLabel?.id || !result.issueLabel?.name) {
    throw new Error("Linear did not confirm label creation");
  }

  return { id: result.issueLabel.id, name: result.issueLabel.name, alreadyExists: false };
}

async function lookupInProgressStateId(apiKey: string, teamId: string): Promise<string> {
  const data = await callLinearGraphQL(apiKey, buildTeamStatesQuery(), { teamId });
  const states = (data.data?.team as Record<string, unknown> | undefined)?.states as
    | { nodes?: Array<{ id: string; name: string }> }
    | undefined;
  const inProgress = states?.nodes?.find((state) => state.name.toLowerCase() === "in progress");
  if (!inProgress) {
    throw new Error('No "In Progress" state found for the team');
  }
  return inProgress.id;
}

async function createLinearTestIssue(
  apiKey: string,
  projectSlug: string,
): Promise<{ identifier: string; url: string }> {
  const project = await lookupProject(apiKey, projectSlug);
  const teamId = project.teams?.nodes?.[0]?.id;
  if (!teamId) {
    throw new Error("No team found for the selected project");
  }

  const stateId = await lookupInProgressStateId(apiKey, teamId);
  const data = await callLinearGraphQL(apiKey, buildCreateIssueMutation(), {
    teamId,
    projectId: project.id,
    title: "Risoluto smoke test",
    description:
      "This issue was created automatically to verify your Risoluto setup. " +
      "Risoluto should pick it up within one poll cycle and run a sandboxed agent.",
    stateId,
  });

  const result = data.data?.issueCreate as
    | { success?: boolean; issue?: { identifier?: string; url?: string } }
    | undefined;

  if (!result?.success || !result.issue?.identifier || !result.issue?.url) {
    throw new Error("Linear did not confirm issue creation");
  }

  return { identifier: result.issue.identifier, url: result.issue.url };
}

function isSupportedGitHubHost(hostname: string): boolean {
  return hostname === "github.com" || hostname === "www.github.com";
}

function isGitHubSegment(value: string): boolean {
  return /^[\w.-]+$/u.test(value);
}

export function parseOwnerRepo(url: string): { owner: string; repo: string } | null {
  if (url !== url.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !isSupportedGitHubHost(parsed.hostname) || parsed.search || parsed.hash) {
      return null;
    }

    const normalizedPath = parsed.pathname.endsWith("/") ? parsed.pathname.slice(0, -1) : parsed.pathname;
    const segments = normalizedPath.split("/");
    if (segments.length !== 3) {
      return null;
    }

    const [, owner, rawRepo] = segments;
    const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;
    if (!isGitHubSegment(owner) || !isGitHubSegment(repo)) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

export function resolveToken(deps: Pick<SetupApiDeps, "secretsStore">): string | null {
  const fromSecrets = deps.secretsStore.get("GITHUB_TOKEN") ?? null;
  if (fromSecrets) {
    return fromSecrets;
  }
  return process.env.GITHUB_TOKEN ?? null;
}

export async function fetchDefaultBranch(
  owner: string,
  repo: string,
  token: string | null,
  fetchImpl: typeof fetch,
): Promise<string> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "risoluto",
    "x-github-api-version": "2022-11-28",
  };

  if (token) {
    try {
      const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
        method: "GET",
        headers: { ...headers, authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        if (typeof data.default_branch === "string") {
          return data.default_branch;
        }
      }
    } catch {
      // Fall through to the unauthenticated request for public repos.
    }
  }

  const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.default_branch === "string") {
    return data.default_branch;
  }
  return DEFAULT_BRANCH_FALLBACK;
}

export interface SetupService {
  getStatus(): SetupStatusSnapshot;
  createMasterKey(providedKey?: string | null): Promise<{ key: string }>;
  getLinearProjects(): Promise<{ projects: LinearProjectOption[] }>;
  selectLinearProject(slugId: string): Promise<{ ok: true }>;
  saveOpenaiKey(key: string, provider: SetupProviderConfig): Promise<{ valid: boolean }>;
  saveCodexAuth(authJson: string): Promise<{ ok: true }>;
  startPkceAuth(): Promise<{ authUrl: string }>;
  getPkceAuthStatus(): Promise<{ status: string; error?: string }>;
  cancelPkceAuth(): Promise<{ ok: true }>;
  saveGithubToken(token: string): Promise<{ valid: boolean }>;
  createTestIssue(): Promise<{ ok: true; issueIdentifier: string; issueUrl: string }>;
  createLabel(): Promise<{ ok: true; labelId: string; labelName: string; alreadyExists: boolean }>;
  getRepoRoutes(): { routes: RepoRouteEntry[] };
  saveRepoRoute(input: SaveRepoRouteInput): Promise<{ ok: true; route: RepoRouteEntry }>;
  deleteRepoRoute(index: number): Promise<{ ok: true; routes: RepoRouteEntry[] }>;
  detectDefaultBranch(repoUrl: string | null): Promise<{ defaultBranch: string }>;
  createProject(name: string): Promise<{
    ok: true;
    project: { id?: string; name?: string; slugId?: string; url: string | null; teamKey: string | null };
  }>;
  reset(): Promise<{ ok: true }>;
}

class SetupServiceImpl implements SetupService {
  private activePkceSession: PkceSession | null = null;

  constructor(private readonly deps: SetupApiDeps) {}

  getStatus(): SetupStatusSnapshot {
    const masterKeyDone = this.deps.secretsStore.isInitialized();
    const overlay = this.deps.configOverlayStore.toMap();
    const linearProjectDone = Boolean(readProjectSlug(overlay));
    const hasApiKey = !!(this.deps.secretsStore.get("OPENAI_API_KEY") || process.env.OPENAI_API_KEY);
    const hasAuthJson = hasCodexAuthFile(this.deps.archiveDir, overlay);
    const openaiKeyDone = hasApiKey || hasAuthJson;
    const githubTokenDone = !!(this.deps.secretsStore.get("GITHUB_TOKEN") || process.env.GITHUB_TOKEN);

    return {
      configured: masterKeyDone && linearProjectDone,
      steps: {
        masterKey: { done: masterKeyDone },
        linearProject: { done: linearProjectDone },
        repoRoute: { done: hasRepoRoutes(overlay) },
        openaiKey: { done: openaiKeyDone },
        githubToken: { done: githubTokenDone },
      },
    };
  }

  async createMasterKey(providedKey?: string | null): Promise<{ key: string }> {
    if (this.deps.secretsStore.isInitialized()) {
      throw new SetupServiceError(409, "already_initialized", "Master key is already set");
    }

    const key = providedKey ?? randomBytes(32).toString("hex");
    const keyFile = path.join(this.deps.archiveDir, "master.key");
    await mkdir(this.deps.archiveDir, { recursive: true });
    await writeFile(keyFile, key, { encoding: "utf8", mode: 0o600 });
    await this.deps.secretsStore.initializeWithKey(key);
    return { key };
  }

  async getLinearProjects(): Promise<{ projects: LinearProjectOption[] }> {
    const apiKey = getLinearApiKey(this.deps);
    if (!apiKey) {
      throw new SetupServiceError(400, "missing_api_key", "LINEAR_API_KEY not configured");
    }

    const query = "{ projects(first: 50) { nodes { id name slugId teams { nodes { key } } } } }";
    const data = await callLinearGraphQL(apiKey, query, {});
    const nodes = (data.data?.projects as Record<string, unknown> | undefined)?.nodes as unknown[] | undefined;
    const projects = (nodes ?? []).map((nodeValue) => {
      const node = nodeValue as Record<string, unknown>;
      const teams = node.teams as { nodes?: Array<{ key: string }> } | undefined;
      return {
        id: node.id,
        name: node.name,
        slugId: node.slugId,
        teamKey: teams?.nodes?.[0]?.key ?? null,
      };
    });

    return { projects };
  }

  async selectLinearProject(slugId: string): Promise<{ ok: true }> {
    await this.deps.configOverlayStore.set("tracker.project_slug", slugId);
    await this.deps.orchestrator.start();
    this.deps.orchestrator.requestRefresh("setup");
    return { ok: true };
  }

  async saveOpenaiKey(key: string, provider: SetupProviderConfig): Promise<{ valid: boolean }> {
    if (provider.supplied && !provider.baseUrl) {
      throw new SetupServiceError(
        400,
        "missing_provider_base_url",
        "provider.baseUrl is required when provider is configured",
      );
    }

    const valid = await validateOpenaiKey(key, getValidationUrl(provider.baseUrl));
    if (!valid) {
      return { valid: false };
    }

    await Promise.all([
      this.deps.secretsStore.set("OPENAI_API_KEY", key),
      this.deps.configOverlayStore.set("codex.auth.mode", "api_key"),
    ]);

    await this.deps.configOverlayStore.delete("codex.provider");
    if (provider.baseUrl) {
      const operations: Promise<unknown>[] = [
        this.deps.configOverlayStore.set("codex.provider.base_url", provider.baseUrl),
        this.deps.configOverlayStore.set("codex.provider.env_key", "OPENAI_API_KEY"),
        this.deps.configOverlayStore.set("codex.provider.wire_api", "responses"),
      ];
      if (provider.name) {
        operations.push(this.deps.configOverlayStore.set("codex.provider.name", provider.name));
      }
      await Promise.all(operations);
    }

    return { valid: true };
  }

  async saveCodexAuth(authJson: string): Promise<{ ok: true }> {
    const normalizedAuthJson = normalizeCodexAuthJson(authJson);
    const authDir = path.join(this.deps.archiveDir, "codex-auth");
    await mkdir(authDir, { recursive: true });
    await writeFile(path.join(authDir, "auth.json"), normalizedAuthJson, { encoding: "utf8", mode: 0o600 });

    await Promise.all([
      this.deps.configOverlayStore.set("codex.auth.mode", "openai_login"),
      this.deps.configOverlayStore.set("codex.auth.source_home", authDir),
      this.deps.configOverlayStore.delete("codex.provider"),
    ]);

    return { ok: true };
  }

  async startPkceAuth(): Promise<{ authUrl: string }> {
    try {
      const reachError = await checkAuthEndpointReachable();
      if (reachError) {
        throw new SetupServiceError(502, "auth_unreachable", reachError);
      }

      if (this.activePkceSession) {
        shutdownCallbackServer(this.activePkceSession);
      }

      this.activePkceSession = createPkceSession();
      await startCallbackServer(this.activePkceSession);
      return { authUrl: this.activePkceSession.authUrl };
    } catch (error) {
      if (error instanceof SetupServiceError) {
        throw error;
      }
      throw new SetupServiceError(
        500,
        "pkce_start_error",
        this.activePkceSession?.error ?? (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async exchangeAndSaveFromSession(session: PkceSession): Promise<{ status: string; error?: string }> {
    try {
      const tokenData = await exchangePkceCode(session.authCode!, session.codeVerifier, session.redirectUri);
      await savePkceAuthTokens(tokenData, this.deps.archiveDir, this.deps.configOverlayStore);
      session.complete = true;
      shutdownCallbackServer(session);
      return { status: "complete" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.error = message;
      shutdownCallbackServer(session);
      return { status: "error", error: message };
    }
  }

  async getPkceAuthStatus(): Promise<{ status: string; error?: string }> {
    if (!this.activePkceSession) {
      return { status: "idle" };
    }
    if (this.activePkceSession.error) {
      shutdownCallbackServer(this.activePkceSession);
      return { status: "error", error: this.activePkceSession.error };
    }
    if (this.activePkceSession.complete) {
      return { status: "complete" };
    }
    if (this.activePkceSession.authCode) {
      return this.exchangeAndSaveFromSession(this.activePkceSession);
    }
    if (Date.now() - this.activePkceSession.createdAt > 3 * 60 * 1000) {
      this.activePkceSession.error = "Authentication timed out. Please try again.";
      shutdownCallbackServer(this.activePkceSession);
      return { status: "expired", error: this.activePkceSession.error };
    }
    return { status: "pending" };
  }

  async cancelPkceAuth(): Promise<{ ok: true }> {
    if (this.activePkceSession) {
      shutdownCallbackServer(this.activePkceSession);
      this.activePkceSession = null;
    }
    return { ok: true };
  }

  async saveGithubToken(token: string): Promise<{ valid: boolean }> {
    let valid: boolean;
    try {
      const ghResponse = await fetch("https://api.github.com/user", {
        headers: { authorization: `token ${token}`, "user-agent": "Risoluto" },
      });
      valid = ghResponse.ok;
    } catch {
      valid = false;
    }

    if (valid) {
      await this.deps.secretsStore.set("GITHUB_TOKEN", token);
    }

    return { valid };
  }

  getRepoRoutes(): { routes: RepoRouteEntry[] } {
    return { routes: readRepos(this.deps.configOverlayStore.toMap()) };
  }

  async saveRepoRoute(input: SaveRepoRouteInput): Promise<{ ok: true; route: RepoRouteEntry }> {
    const repoUrl = normalizeRepoUrl(input.repoUrl);
    if (!repoUrl) {
      throw new SetupServiceError(
        400,
        "invalid_repo_url",
        "repoUrl must be a valid GitHub URL (https://github.com/org/repo)",
      );
    }

    const identifierPrefix = normalizeIdentifierPrefix(input.identifierPrefix);
    if (!identifierPrefix) {
      throw new SetupServiceError(400, "missing_prefix", "identifierPrefix is required");
    }

    const label = normalizeLabel(input.label);
    const entry: RepoRouteEntry = {
      repo_url: repoUrl,
      default_branch: normalizeDefaultBranch(input.defaultBranch),
      identifier_prefix: identifierPrefix,
      ...(label ? { label } : {}),
    };

    const existing = readRepos(this.deps.configOverlayStore.toMap());
    const filtered = existing.filter((route) => route.identifier_prefix !== identifierPrefix);
    filtered.push(entry);

    await this.deps.configOverlayStore.set("repos", filtered);
    return { ok: true, route: entry };
  }

  async deleteRepoRoute(index: number): Promise<{ ok: true; routes: RepoRouteEntry[] }> {
    const existing = readRepos(this.deps.configOverlayStore.toMap());
    if (!Number.isInteger(index) || index < 0 || index >= existing.length) {
      throw new SetupServiceError(400, "invalid_index", `index must be between 0 and ${existing.length - 1}`);
    }

    existing.splice(index, 1);
    await this.deps.configOverlayStore.set("repos", existing);
    return { ok: true, routes: existing };
  }

  async detectDefaultBranch(repoUrl: string | null): Promise<{ defaultBranch: string }> {
    const normalizedRepoUrl = trimOptionalNonEmptyString(repoUrl);
    if (!normalizedRepoUrl) {
      throw new SetupServiceError(400, "missing_repo_url", "repoUrl is required");
    }

    const parsed = parseOwnerRepo(normalizedRepoUrl);
    if (!parsed) {
      throw new SetupServiceError(400, "invalid_repo_url", "repoUrl must be a valid GitHub URL");
    }

    try {
      const defaultBranch = await fetchDefaultBranch(parsed.owner, parsed.repo, resolveToken(this.deps), fetch);
      return { defaultBranch };
    } catch {
      return { defaultBranch: DEFAULT_BRANCH_FALLBACK };
    }
  }

  async createTestIssue(): Promise<{ ok: true; issueIdentifier: string; issueUrl: string }> {
    const apiKey = getLinearApiKey(this.deps);
    if (!apiKey) {
      throw new SetupServiceError(400, "missing_api_key", "LINEAR_API_KEY not configured");
    }

    const projectSlug = readProjectSlug(this.deps.configOverlayStore.toMap());
    if (!projectSlug) {
      throw new SetupServiceError(400, "missing_project", "No Linear project selected");
    }

    const { identifier, url } = await createLinearTestIssue(apiKey, projectSlug);
    return { ok: true, issueIdentifier: identifier, issueUrl: url };
  }

  async createLabel(): Promise<{ ok: true; labelId: string; labelName: string; alreadyExists: boolean }> {
    const apiKey = getLinearApiKey(this.deps);
    if (!apiKey) {
      throw new SetupServiceError(400, "missing_api_key", "LINEAR_API_KEY not configured");
    }

    const projectSlug = readProjectSlug(this.deps.configOverlayStore.toMap());
    if (!projectSlug) {
      throw new SetupServiceError(400, "missing_project", "No Linear project selected");
    }

    const { id, name, alreadyExists } = await createRisolutoLabel(apiKey, projectSlug);
    return { ok: true, labelId: id, labelName: name, alreadyExists };
  }

  async createProject(name: string): Promise<{
    ok: true;
    project: { id?: string; name?: string; slugId?: string; url: string | null; teamKey: string | null };
  }> {
    const apiKey = getLinearApiKey(this.deps);
    if (!apiKey) {
      throw new SetupServiceError(400, "missing_api_key", "LINEAR_API_KEY not configured");
    }

    const teams = await fetchLinearTeams(apiKey);
    if (!teams.length) {
      throw new SetupServiceError(400, "no_teams", "No teams found in your Linear workspace");
    }

    const result = await createLinearProject(apiKey, name, [teams[0].id]);
    if (!result?.success || !result.project?.slugId) {
      throw new Error("Linear did not confirm project creation");
    }

    return {
      ok: true,
      project: {
        id: result.project.id,
        name: result.project.name,
        slugId: result.project.slugId,
        url: result.project.url ?? null,
        teamKey: result.project.teams?.nodes?.[0]?.key ?? teams[0].key,
      },
    };
  }

  async reset(): Promise<{ ok: true }> {
    await this.deps.orchestrator.stop();
    await Promise.all(this.deps.secretsStore.list().map((key) => this.deps.secretsStore.delete(key)));
    await Promise.all([
      this.deps.configOverlayStore.set("codex.auth.mode", ""),
      this.deps.configOverlayStore.set("codex.auth.source_home", ""),
      this.deps.configOverlayStore.delete("codex.provider"),
      writeFile(path.join(this.deps.archiveDir, "master.key"), "", { encoding: "utf8", mode: 0o600 }),
    ]);
    this.deps.secretsStore.reset();
    return { ok: true };
  }
}

const setupServiceCache = new WeakMap<SetupApiDeps, SetupService>();

export function createSetupService(deps: SetupApiDeps): SetupService {
  return new SetupServiceImpl(deps);
}

export function getSetupService(deps: SetupApiDeps): SetupService {
  const existing = setupServiceCache.get(deps);
  if (existing) {
    return existing;
  }
  const service = createSetupService(deps);
  setupServiceCache.set(deps, service);
  return service;
}

export function isSetupService(value: SetupApiDeps | SetupService): value is SetupService {
  return typeof (value as SetupService).getStatus === "function";
}

export function resolveSetupService(value: SetupApiDeps | SetupService): SetupService {
  return isSetupService(value) ? value : getSetupService(value);
}
