import { api } from "../../api.js";
import type { CodexAccountLoginStartResponse, CodexThreadDetail } from "../../types/codex.js";
import type { CodexAdminData } from "./codex-admin-helpers.js";

export async function loadCodexAdminData(): Promise<CodexAdminData> {
  return api.getCodexAdmin();
}

export async function loadCodexThreadDetail(threadId: string): Promise<CodexThreadDetail> {
  const response = await api.getCodexThread(threadId, true);
  return response.thread;
}

export async function unsubscribeCodexThread(threadId: string): Promise<void> {
  await api.postCodexThreadUnsubscribe(threadId);
}

export async function renameCodexThread(threadId: string, name: string): Promise<void> {
  await api.postCodexThreadRename(threadId, name);
}

export async function forkCodexThread(threadId: string): Promise<void> {
  await api.postCodexThreadFork(threadId);
}

export async function setCodexThreadArchived(threadId: string, archived: boolean): Promise<void> {
  if (archived) {
    await api.postCodexThreadArchive(threadId);
    return;
  }
  await api.postCodexThreadUnarchive(threadId);
}

export async function startCodexApiKeyLogin(apiKey: string): Promise<void> {
  await api.postCodexAccountLoginStart({ type: "apiKey", apiKey });
}

export async function startCodexBrowserLogin(): Promise<CodexAccountLoginStartResponse> {
  return api.postCodexAccountLoginStart({ type: "chatgpt" });
}

export async function cancelCodexBrowserLogin(loginId: string): Promise<void> {
  await api.postCodexAccountLoginCancel(loginId);
}

export async function logoutCodexAccount(): Promise<void> {
  await api.postCodexAccountLogout();
}

export async function reloadCodexMcp(): Promise<void> {
  await api.postCodexMcpReload();
}

export async function startCodexMcpOauthLogin(name: string): Promise<Record<string, unknown>> {
  return api.postCodexMcpOauthLogin(name);
}

export async function answerCodexUserInputRequest(requestId: string, result: unknown): Promise<void> {
  await api.postCodexUserInputResponse(requestId, result);
}
