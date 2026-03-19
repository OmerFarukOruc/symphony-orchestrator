import type { AttemptRecord, AttemptSummary, IssueDetail, PlannedIssue, RuntimeInfo, RuntimeSnapshot } from "./types";

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
  getIssue: (id: string) => get<IssueDetail>(`/api/v1/${encodeURIComponent(id)}`),
  getAttempts: (id: string) =>
    get<{ attempts: AttemptSummary[]; current_attempt_id: string | null }>(
      `/api/v1/${encodeURIComponent(id)}/attempts`,
    ),
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
  postPlan: (payload: { goal: string; maxIssues?: number; labels?: string[] }) =>
    post<{ goal: string; generatedAt: string; issues: PlannedIssue[]; prompt: string }>("/api/v1/plan", {
      goal: payload.goal,
      maxIssues: payload.maxIssues,
      max_issues: payload.maxIssues,
      labels: payload.labels,
    }),
  postPlanExecute: (issues: PlannedIssue[]) =>
    post<{ created: number; external_ids: string[] }>("/api/v1/plan/execute", { issues }),
  postModelOverride: (id: string, payload: { model: string; reasoningEffort: string }) =>
    post<void>(`/api/v1/${encodeURIComponent(id)}/model`, {
      model: payload.model,
      reasoning_effort: payload.reasoningEffort,
    }),
  getMetrics: () => get<string>("/metrics"),
  getNotifications: () =>
    get<{
      notifications: Array<{
        id: string;
        title: string;
        detail: string;
        channel: string;
        timestamp: string;
        read: boolean;
        delivery_status: string;
        issue_identifier?: string;
      }>;
    }>("/api/v1/notifications"),
  getGitPrs: () =>
    get<{
      pull_requests: Array<{
        issue: string;
        branch: string;
        title: string;
        pr_number: number;
        status: string;
        updated: string;
        url?: string;
      }>;
      summary: { active_branches: number; open_prs: number; merged_today: number; failed_ops: number };
    }>("/api/v1/git/prs"),
  getWorkspaces: () =>
    get<{
      workspaces: Array<{
        key: string;
        issue: string;
        status: string;
        path: string;
        size: string;
        last_activity: string;
      }>;
      summary: { total: number; active: number; stale: number; disk_usage: string };
    }>("/api/v1/workspaces"),
  getContainers: () =>
    get<{
      containers: Array<{
        id: string;
        name: string;
        status: string;
        issue?: string;
        cpu_percent: number;
        memory_used: string;
        memory_limit: string;
        uptime: string;
      }>;
      summary: { running: number; stopped: number; errored: number; avg_cpu: string };
    }>("/api/v1/containers"),
  getGlobalRuns: () =>
    get<{
      runs: Array<{
        issue: string;
        attempt: number;
        status: string;
        duration: string;
        model: string;
        tokens: number;
        started: string;
      }>;
    }>("/api/v1/runs"),
};
