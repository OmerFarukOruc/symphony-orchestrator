import type { PendingUserInputRequest } from "./control-plane.js";
import { CODEX_METHOD } from "./methods.js";
import { readCodexAdminSnapshot, type CodexAdminSnapshot } from "./admin-snapshot.js";
import type { SecretsPort } from "../secrets/port.js";

export interface CodexAdminServiceControlPlane {
  getCapabilities(): Promise<CodexAdminSnapshot["capabilities"]>;
  listPendingUserInputRequests(): PendingUserInputRequest[];
  respondToRequest(requestId: string, result: unknown): Promise<boolean>;
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface CodexThreadListQuery {
  cursor: string | null;
  limit: number;
  sortKey: "created_at" | "updated_at";
  archived?: boolean;
  cwd?: string;
  modelProviders: string[];
  sourceKinds: string[];
}

export interface CodexAccountLoginStartPayload {
  type?: string;
  apiKey?: string;
}

function readMethods(deps: { controlPlane: CodexAdminServiceControlPlane; secretsStore?: Pick<SecretsPort, "get"> }) {
  return {
    readSnapshot(): Promise<CodexAdminSnapshot> {
      return readCodexAdminSnapshot({
        controlPlane: deps.controlPlane,
        secretsStore: deps.secretsStore,
      });
    },
    readFeatures(limit = 50, cursor: string | null = null): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ExperimentalFeatureList, { limit, cursor });
    },
    readCollaborationModes(): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.CollaborationModeList, {});
    },
    readMcpServers(limit = 50, cursor: string | null = null): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.McpServerStatusList, { limit, cursor });
    },
    readThreads(query: CodexThreadListQuery): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ThreadList, {
        cursor: query.cursor,
        limit: query.limit,
        sortKey: query.sortKey,
        archived: query.archived,
        cwd: undefined,
        modelProviders: query.modelProviders,
        sourceKinds: query.sourceKinds,
      });
    },
    readLoadedThreads(): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ThreadLoadedList, {});
    },
    readThread(threadId: string, includeTurns: boolean): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ThreadRead, { threadId, includeTurns });
    },
    readAccount(): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.AccountRead, { refreshToken: false });
    },
    readAccountRateLimits(): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.AccountRateLimitsRead, {});
    },
    listPendingUserInputRequests(): { data: PendingUserInputRequest[] } {
      return { data: deps.controlPlane.listPendingUserInputRequests() };
    },
  };
}

function mutationMethods(deps: { controlPlane: CodexAdminServiceControlPlane }) {
  return {
    startMcpOauthLogin(name: string): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.McpServerOauthLogin, { name });
    },
    reloadMcpServers(): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ConfigMcpServerReload, {});
    },
    forkThread(threadId: string): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ThreadFork, { threadId });
    },
    renameThread(threadId: string, name: string): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ThreadNameSet, { threadId, name });
    },
    archiveThread(threadId: string): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ThreadArchive, { threadId });
    },
    unarchiveThread(threadId: string): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ThreadUnarchive, { threadId });
    },
    unsubscribeThread(threadId: string): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.ThreadUnsubscribe, { threadId });
    },
    startAccountLogin(payload: CodexAccountLoginStartPayload): Promise<unknown> {
      const requestPayload: Record<string, unknown> = {};
      if (typeof payload.type === "string") requestPayload.type = payload.type;
      if (typeof payload.apiKey === "string") requestPayload.apiKey = payload.apiKey;
      return deps.controlPlane.request(CODEX_METHOD.AccountLoginStart, requestPayload);
    },
    cancelAccountLogin(loginId: string): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.AccountLoginCancel, { loginId });
    },
    logoutAccount(): Promise<unknown> {
      return deps.controlPlane.request(CODEX_METHOD.AccountLogout, {});
    },
    respondToUserInput(requestId: string, result: unknown): Promise<boolean> {
      return deps.controlPlane.respondToRequest(requestId, result);
    },
  };
}

export function createCodexAdminService(deps: {
  controlPlane: CodexAdminServiceControlPlane;
  secretsStore?: Pick<SecretsPort, "get">;
}) {
  return {
    ...readMethods(deps),
    ...mutationMethods(deps),
  };
}
