import type { ConfigOverlayPort } from "../config/overlay.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { SecretsPort } from "../secrets/port.js";
import type { TrackerPort } from "../tracker/port.js";

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

export interface SetupApiDeps {
  secretsStore: SecretsPort;
  configOverlayStore: ConfigOverlayPort;
  orchestrator: OrchestratorPort;
  archiveDir: string;
  tracker?: TrackerPort;
}

export interface SetupPort {
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
