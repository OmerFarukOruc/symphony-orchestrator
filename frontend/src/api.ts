import type {
  AbortIssueResponse,
  AttemptCheckpointRecord,
  AttemptRecord,
  AttemptSummary,
  IssueDetail,
  SteerIssueResponse,
} from "./types/issues.js";
import type {
  CodexAdminSnapshotResponse,
  CodexCapabilities,
  CodexAccountLoginStartResponse,
  CodexAccountResponse,
  CodexModelCatalogEntry,
  CodexCollaborationModeEntry,
  CodexFeatureListResponse,
  CodexLoadedThreadsResponse,
  CodexMcpServerStatusListResponse,
  CodexRateLimitsResponse,
  CodexThreadReadResponse,
  CodexThreadListResponse,
  CodexUserInputRequestListResponse,
} from "./types/codex.js";
import type { GitContextResponse, LinearProject, SetupStatus } from "./types/setup.js";
import type { AuditRecord, PromptTemplate, RuntimeInfo, TrackedPrRecord } from "./types/config.js";
import type { RuntimeSnapshot } from "./types/runtime.js";
import type {
  NotificationReadResponse,
  NotificationsListResponse,
  NotificationsReadAllResponse,
} from "./types/notifications.js";
import type { ObservabilitySummary } from "./types/observability.js";
import type { WorkspaceInventoryResponse } from "./types/workspace.js";
import { getReadAccessToken, getWriteAccessToken } from "./access-token";

const BASE = "";

function withAuthorization(headers: HeadersInit | undefined, token: string | null): HeadersInit | undefined {
  if (!token) {
    return headers;
  }
  return { ...(headers ?? {}), Authorization: `Bearer ${token}` };
}

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
  const response = await fetch(BASE + path, {
    headers: withAuthorization(undefined, getReadAccessToken()),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return readResponse<T>(response);
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = withAuthorization(
    body === undefined ? undefined : { "content-type": "application/json" },
    method === "GET" || method === "HEAD" ? getReadAccessToken() : getWriteAccessToken(),
  );
  const response = await fetch(BASE + path, {
    method,
    headers,
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

interface SetupOpenaiKeyPayload {
  key: string;
  provider?: {
    name?: string;
    baseUrl: string;
  };
}

export const api = {
  getModels: () =>
    get<{
      models: CodexModelCatalogEntry[];
      nextCursor?: string | null;
    }>("/api/v1/models"),
  getCodexAdmin: () => get<CodexAdminSnapshotResponse>("/api/v1/codex/admin"),
  getCodexCapabilities: () => get<CodexCapabilities>("/api/v1/codex/capabilities"),
  getCodexThreads: (params?: {
    cursor?: string;
    limit?: number;
    sortKey?: "created_at" | "updated_at";
    archived?: boolean;
    cwd?: string;
    modelProviders?: string[];
    sourceKinds?: string[];
  }) => {
    const qs = new URLSearchParams();
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.sortKey) qs.set("sortKey", params.sortKey);
    if (params?.archived !== undefined) qs.set("archived", String(params.archived));
    if (params?.cwd) qs.set("cwd", params.cwd);
    if (params?.modelProviders?.length) qs.set("modelProviders", params.modelProviders.join(","));
    if (params?.sourceKinds?.length) qs.set("sourceKinds", params.sourceKinds.join(","));
    const query = qs.toString();
    return get<CodexThreadListResponse>(query ? `/api/v1/codex/threads?${query}` : "/api/v1/codex/threads");
  },
  getCodexLoadedThreads: () => get<CodexLoadedThreadsResponse>("/api/v1/codex/threads/loaded"),
  getCodexThread: (threadId: string, includeTurns = false) =>
    get<CodexThreadReadResponse>(
      `/api/v1/codex/threads/${encodeURIComponent(threadId)}${includeTurns ? "?includeTurns=true" : ""}`,
    ),
  postCodexThreadFork: (threadId: string) =>
    post<{ thread?: { id?: string } }>(`/api/v1/codex/threads/${encodeURIComponent(threadId)}/fork`, {}),
  postCodexThreadRename: (threadId: string, name: string) =>
    post<unknown>(`/api/v1/codex/threads/${encodeURIComponent(threadId)}/name`, { name }),
  postCodexThreadArchive: (threadId: string) =>
    post<unknown>(`/api/v1/codex/threads/${encodeURIComponent(threadId)}/archive`, {}),
  postCodexThreadUnarchive: (threadId: string) =>
    post<unknown>(`/api/v1/codex/threads/${encodeURIComponent(threadId)}/unarchive`, {}),
  postCodexThreadUnsubscribe: (threadId: string) =>
    post<{ status?: string }>(`/api/v1/codex/threads/${encodeURIComponent(threadId)}/unsubscribe`, {}),
  getCodexFeatures: () => get<CodexFeatureListResponse>("/api/v1/codex/features"),
  getCodexCollaborationModes: () =>
    get<{ data?: CodexCollaborationModeEntry[] } | CodexCollaborationModeEntry[]>("/api/v1/codex/collaboration-modes"),
  getCodexMcp: () => get<CodexMcpServerStatusListResponse>("/api/v1/codex/mcp"),
  postCodexMcpReload: () => post<unknown>("/api/v1/codex/mcp/reload", {}),
  postCodexMcpOauthLogin: (name: string) =>
    post<Record<string, unknown>>("/api/v1/codex/mcp/oauth/login", {
      name,
    }),
  getCodexUserInputRequests: () => get<CodexUserInputRequestListResponse>("/api/v1/codex/requests/user-input"),
  postCodexUserInputResponse: (requestId: string, result: unknown) =>
    post<{ ok: boolean }>(`/api/v1/codex/requests/user-input/${encodeURIComponent(requestId)}/respond`, { result }),
  getCodexAccount: () => get<CodexAccountResponse>("/api/v1/codex/account"),
  getCodexAccountRateLimits: () => get<CodexRateLimitsResponse>("/api/v1/codex/account/rate-limits"),
  postCodexAccountLoginStart: (body: Record<string, unknown>) =>
    post<CodexAccountLoginStartResponse>("/api/v1/codex/account/login/start", body),
  postCodexAccountLoginCancel: (loginId: string) => post<unknown>("/api/v1/codex/account/login/cancel", { loginId }),
  postCodexAccountLogout: () => post<unknown>("/api/v1/codex/account/logout", {}),
  getState: () => get<RuntimeSnapshot>("/api/v1/state"),
  getObservability: () => get<ObservabilitySummary>("/api/v1/observability"),
  getRuntime: () => get<RuntimeInfo>("/api/v1/runtime"),
  getNotifications: (params?: { limit?: number; unread?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) {
      qs.set("limit", String(params.limit));
    }
    if (params?.unread) {
      qs.set("unread", "true");
    }
    const query = qs.toString();
    return get<NotificationsListResponse>(query ? `/api/v1/notifications?${query}` : "/api/v1/notifications");
  },
  postNotificationRead: (id: string) => {
    if (!id) return Promise.reject(new Error("notification id is required"));
    return send<NotificationReadResponse>("POST", `/api/v1/notifications/${encodeURIComponent(id)}/read`);
  },
  postNotificationsReadAll: () => send<NotificationsReadAllResponse>("POST", "/api/v1/notifications/read-all"),
  postNotificationTest: () => post<{ ok: true; sentAt: string }>("/api/v1/notifications/test", {}),
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
  getAttemptCheckpoints: (id: string) =>
    get<{ checkpoints: AttemptCheckpointRecord[] }>(`/api/v1/attempts/${encodeURIComponent(id)}/checkpoints`),
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
  postTemplateOverride: (identifier: string, templateId: string) =>
    post<void>(`/api/v1/${encodeURIComponent(identifier)}/template`, { template_id: templateId }),
  deleteTemplateOverride: (identifier: string) => del(`/api/v1/${encodeURIComponent(identifier)}/template`),
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
  postOpenaiKey: (payload: SetupOpenaiKeyPayload) => post<{ valid: boolean }>("/api/v1/setup/openai-key", payload),
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
  getTrackedPrs: (params?: { status?: TrackedPrRecord["status"] }) => {
    const qs = new URLSearchParams();
    if (params?.status) {
      qs.set("status", params.status);
    }
    const query = qs.toString();
    const path = query ? `/api/v1/prs?${query}` : "/api/v1/prs";
    return get<{ prs: TrackedPrRecord[] }>(path);
  },
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

  previewTemplate: async (id: string): Promise<{ rendered: string; error: string | null }> => {
    const response = await fetch(`${BASE}/api/v1/templates/${encodeURIComponent(id)}/preview`, {
      method: "POST",
      headers: withAuthorization({ "content-type": "application/json" }, getWriteAccessToken()),
      body: "{}",
    });
    const body = (await response.json()) as { rendered: string; error: string | null };
    if (!response.ok && !body.error) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return body;
  },

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
