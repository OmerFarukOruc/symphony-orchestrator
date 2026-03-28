import type {
  AbortIssueResponse,
  AttemptRecord,
  AttemptSummary,
  AuditRecord,
  GitContextResponse,
  IssueDetail,
  LinearProject,
  PromptTemplate,
  RuntimeInfo,
  RuntimeSnapshot,
  SetupStatus,
  SteerIssueResponse,
  WorkspaceInventoryResponse,
} from "./types";

const BASE = "";

async function readError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `${response.status} ${response.statusText}`;
  }
  return (await response.text()) || `${response.status} ${response.statusText}`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  return (await response.text()) as T;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(BASE + path);
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return readResponse<T>(response);
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(BASE + path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return readResponse<T>(response);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return send<T>("POST", path, body);
}

async function put<T>(path: string, body: unknown): Promise<T> {
  return send<T>("PUT", path, body);
}

async function del(path: string): Promise<void> {
  await send<unknown>("DELETE", path);
}

export const api = {
  getModels: () => get<{ models: Array<{ id: string; displayName: string; isDefault: boolean }> }>("/api/v1/models"),
  getState: () => get<RuntimeSnapshot>("/api/v1/state"),
  getRuntime: () => get<RuntimeInfo>("/api/v1/runtime"),
  getIssue: (id: string) => {
    if (!id) return Promise.reject(new Error("issue id is required"));
    return get<IssueDetail>(`/api/v1/${encodeURIComponent(id)}`);
  },
  postAbortIssue: (id: string) => {
    if (!id) return Promise.reject(new Error("issue id is required"));
    return send<AbortIssueResponse>("POST", `/api/v1/${encodeURIComponent(id)}/abort`);
  },
  postSteerIssue: (id: string, message: string) => {
    if (!id) return Promise.reject(new Error("issue id is required"));
    return post<SteerIssueResponse>(`/api/v1/${encodeURIComponent(id)}/steer`, { message });
  },
  getAttempts: (id: string) => {
    if (!id) return Promise.resolve({ attempts: [] as AttemptSummary[], current_attempt_id: null });
    return get<{ attempts: AttemptSummary[]; current_attempt_id: string | null }>(
      `/api/v1/${encodeURIComponent(id)}/attempts`,
    );
  },
  getAttemptDetail: (id: string) => get<AttemptRecord>(`/api/v1/attempts/${encodeURIComponent(id)}`),
  postRefresh: () => post<{ queued: boolean }>("/api/v1/refresh", {}),
  getConfig: () => get<Record<string, unknown>>("/api/v1/config"),
  getConfigOverlay: () => get<{ overlay: Record<string, unknown> }>("/api/v1/config/overlay"),
  getConfigSchema: () => get<unknown>("/api/v1/config/schema"),
  putConfigOverlay: (data: Record<string, unknown>) =>
    put<{ updated: string[]; overlay: Record<string, unknown> }>("/api/v1/config/overlay", data),
  deleteConfigOverlayPath: (path: string) => del(`/api/v1/config/overlay/${encodeURIComponent(path)}`),
  getSecrets: () => get<{ keys: string[] }>("/api/v1/secrets"),
  postSecret: (key: string, value: string) => post<void>(`/api/v1/secrets/${encodeURIComponent(key)}`, { value }),
  deleteSecret: (key: string) => del(`/api/v1/secrets/${encodeURIComponent(key)}`),

  postModelOverride: (id: string, payload: { model: string; reasoningEffort: string }) =>
    post<void>(`/api/v1/${encodeURIComponent(id)}/model`, {
      model: payload.model,
      reasoning_effort: payload.reasoningEffort,
    }),
  getTransitions: () => get<{ transitions: Record<string, string[]> }>("/api/v1/transitions"),
  postTransition: (id: string, targetState: string) =>
    post<{ ok: boolean; from?: string; to?: string; reason?: string }>(`/api/v1/${encodeURIComponent(id)}/transition`, {
      target_state: targetState,
    }),
  getMetrics: () => get<string>("/metrics"),
  getSetupStatus: () => get<SetupStatus>("/api/v1/setup/status"),
  postMasterKey: (key?: string) => post<{ key: string }>("/api/v1/setup/master-key", { key }),
  getLinearProjects: () => get<{ projects: LinearProject[] }>("/api/v1/setup/linear-projects"),
  postLinearProject: (slugId: string) => post<{ ok: boolean }>("/api/v1/setup/linear-project", { slugId }),
  postOpenaiKey: (key: string) => post<{ valid: boolean }>("/api/v1/setup/openai-key", { key }),
  postCodexAuth: (authJson: string) => post<{ ok: boolean }>("/api/v1/setup/codex-auth", { authJson }),
  startPkceAuth: () => post<{ authUrl: string }>("/api/v1/setup/pkce-auth/start", {}),
  pollPkceAuthStatus: () =>
    get<{ status: "idle" | "pending" | "complete" | "expired" | "error"; error?: string }>(
      "/api/v1/setup/pkce-auth/status",
    ),
  cancelPkceAuth: () => post<{ ok: boolean }>("/api/v1/setup/pkce-auth/cancel", {}),
  postGithubToken: (token: string) => post<{ valid: boolean }>("/api/v1/setup/github-token", { token }),
  postRepoRoute: (route: { repoUrl: string; defaultBranch?: string; identifierPrefix: string; label?: string }) =>
    post<{ ok: boolean; route: Record<string, unknown> }>("/api/v1/setup/repo-route", route),
  getRepoRoutes: () => get<{ routes: Array<Record<string, unknown>> }>("/api/v1/setup/repo-routes"),
  deleteRepoRoute: (index: number) =>
    send<{ ok: boolean; routes: Array<Record<string, unknown>> }>("DELETE", `/api/v1/setup/repo-route/${index}`),
  resetSetup: () => post<{ ok: boolean }>("/api/v1/setup/reset", {}),
  createTestIssue: () =>
    post<{ ok: boolean; issueIdentifier: string; issueUrl: string }>("/api/v1/setup/create-test-issue", {}),
  createLabel: () =>
    post<{ ok: boolean; labelId: string; labelName: string; alreadyExists?: boolean }>(
      "/api/v1/setup/create-label",
      {},
    ),
  createProject: (name: string) =>
    post<{
      ok: boolean;
      project: { id: string; name: string; slugId: string; url: string | null; teamKey: string | null };
    }>("/api/v1/setup/create-project", { name }),
  getGitContext: () => get<GitContextResponse>("/api/v1/git/context"),
  getWorkspaces: () => get<WorkspaceInventoryResponse>("/api/v1/workspaces"),
  removeWorkspace: (workspaceKey: string) => del(`/api/v1/workspaces/${encodeURIComponent(workspaceKey)}`),
  detectDefaultBranch: (repoUrl: string) =>
    post<{ defaultBranch: string }>("/api/v1/setup/detect-default-branch", { repoUrl }),

  // ── Templates ──────────────────────────────
  getTemplates: () => get<{ templates: PromptTemplate[] }>("/api/v1/templates"),

  getTemplate: (id: string) => get<{ template: PromptTemplate }>(`/api/v1/templates/${encodeURIComponent(id)}`),

  createTemplate: (data: { id: string; name: string; body: string }) =>
    post<{ template: PromptTemplate }>("/api/v1/templates", data),

  updateTemplate: (id: string, data: { name?: string; body?: string }) =>
    put<{ template: PromptTemplate }>(`/api/v1/templates/${encodeURIComponent(id)}`, data),

  deleteTemplate: (id: string) => del(`/api/v1/templates/${encodeURIComponent(id)}`),

  previewTemplate: (id: string) =>
    post<{ rendered: string; error: string | null }>(`/api/v1/templates/${encodeURIComponent(id)}/preview`, {}),

  // ── Audit ──────────────────────────────────
  getAuditLog: (params?: {
    tableName?: string;
    key?: string;
    pathPrefix?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) qs.set(k, String(v));
      }
    }
    const query = qs.toString();
    const path = query ? "/api/v1/audit?" + query : "/api/v1/audit";
    return get<{ entries: AuditRecord[]; total: number }>(path);
  },
};
