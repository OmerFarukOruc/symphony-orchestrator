import type {
  AttemptRecord,
  AttemptSummary,
  IssueDetail,
  LinearProject,
  RuntimeInfo,
  RuntimeSnapshot,
  SetupStatus,
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
  getState: () => get<RuntimeSnapshot>("/api/v1/state"),
  getRuntime: () => get<RuntimeInfo>("/api/v1/runtime"),
  getIssue: (id: string) => {
    if (!id) return Promise.reject(new Error("issue id is required"));
    return get<IssueDetail>(`/api/v1/${encodeURIComponent(id)}`);
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
  startDeviceAuth: () =>
    post<{ userCode: string; verificationUri: string; deviceCode: string; expiresIn: number; interval: number }>(
      "/api/v1/setup/device-auth/start",
      {},
    ),
  pollDeviceAuth: (deviceCode: string) =>
    post<{ status: "pending" | "complete" | "expired"; error?: string }>("/api/v1/setup/device-auth/poll", {
      deviceCode,
    }),
  postGithubToken: (token: string) => post<{ valid: boolean }>("/api/v1/setup/github-token", { token }),
};
