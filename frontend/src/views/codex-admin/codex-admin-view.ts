import { api } from "../../api.js";
import { createEmptyState } from "../../components/empty-state.js";
import { registerPageCleanup } from "../../utils/page.js";
import { createAsyncState, handleError, withLoading } from "../../utils/async-state.js";
import { renderAsyncState } from "../../utils/render-guards.js";
import { skeletonBlock } from "../../ui/skeleton.js";
import { toast } from "../../ui/toast.js";
import {
  type CodexAdminData,
  capabilityCounts,
  createMetric,
  createPanel,
  createTag,
  formatErrorMessage,
  normalizeCollaborationModes,
  runCodexAdminAction,
} from "./codex-admin-helpers.js";
import { renderAccountPanel } from "./codex-admin-account.js";
import { renderModelPanel } from "./codex-admin-models.js";
import { renderDiagnosticsPanel } from "./codex-admin-diagnostics.js";
import { renderThreadsPanel } from "./codex-admin-threads.js";
import { renderMcpPanel } from "./codex-admin-mcp.js";
import { renderPendingRequestsPanel } from "./codex-admin-pending.js";
import type { CodexThreadDetail } from "../../types.js";

function createSummaryPanel(data: CodexAdminData): HTMLElement {
  const counts = capabilityCounts(data.capabilities);
  const summary = createPanel(
    "Codex Admin",
    data.capabilities.initializationError
      ? `Control plane connected with issues: ${data.capabilities.initializationError}`
      : "Operator-facing Codex control-plane diagnostics and admin actions.",
  );
  const metrics = document.createElement("div");
  metrics.className = "codex-admin-metrics";
  metrics.append(
    createMetric(
      "Methods",
      String(Object.keys(data.capabilities.methods).length),
      `${counts.supported} supported • ${counts.unsupported} unavailable • ${counts.unknown} unknown`,
    ),
    createMetric("Threads", String(data.threads.length), `${data.loadedThreadIds.length} loaded`),
    createMetric("MCP servers", String(data.mcpServers.length), `${data.pendingRequests.length} pending prompts`),
    createMetric("Features", String(data.features.length), `${data.collaborationModes.length} collaboration modes`),
  );
  const tagRow = document.createElement("div");
  tagRow.className = "codex-admin-tag-row";
  tagRow.append(
    ...data.features
      .slice(0, 6)
      .map((feature) => createTag(feature.displayName || feature.name, feature.enabled ? "success" : "default")),
  );
  summary.append(metrics);
  if (tagRow.childElementCount > 0) {
    summary.append(tagRow);
  }
  return summary;
}

function createLoadedAdmin(
  data: CodexAdminData,
  pendingLoginId: string | null,
  expandedThreadId: string | null,
  threadDetail: CodexThreadDetail | undefined,
  loadingThreadId: string | null,
  onPendingLoginIdChange: (loginId: string | null) => void,
  onToggleThreadDetails: (threadId: string) => Promise<void>,
  onUnsubscribeThread: (threadId: string) => Promise<void>,
  reload: () => Promise<void>,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "codex-admin-stack";
  root.append(
    createSummaryPanel(data),
    renderAccountPanel(
      data.account,
      data.requiresOpenaiAuth,
      data.rateLimits,
      data.rateLimitsByLimitId,
      pendingLoginId,
      onPendingLoginIdChange,
      reload,
    ),
    renderModelPanel(data.models),
    renderDiagnosticsPanel(data.features, data.collaborationModes),
    renderThreadsPanel(
      data.threads,
      new Set(data.loadedThreadIds),
      expandedThreadId,
      threadDetail,
      loadingThreadId,
      onToggleThreadDetails,
      onUnsubscribeThread,
      reload,
    ),
    renderMcpPanel(data.mcpServers, reload),
    renderPendingRequestsPanel(data.pendingRequests, reload),
  );
  return root;
}

export function createCodexAdminSection(): HTMLElement {
  const root = document.createElement("section");
  root.className = "codex-admin-root";
  const state = createAsyncState<CodexAdminData>();
  let refreshTimer: number | null = null;
  let pendingLoginId: string | null = null;
  let expandedThreadId: string | null = null;
  let expandedThreadDetail: CodexThreadDetail | undefined;
  let loadingThreadId: string | null = null;

  async function load(): Promise<void> {
    state.error = null;
    try {
      state.data = await withLoading(
        state,
        async () => {
          const [
            capabilities,
            account,
            rateLimits,
            models,
            threads,
            loadedThreads,
            features,
            collaborationModes,
            mcp,
            pendingRequests,
          ] = await Promise.all([
            api.getCodexCapabilities(),
            api.getCodexAccount(),
            api.getCodexAccountRateLimits(),
            api.getModels(),
            api.getCodexThreads({ limit: 10, sortKey: "updated_at" }),
            api.getCodexLoadedThreads(),
            api.getCodexFeatures(),
            api.getCodexCollaborationModes(),
            api.getCodexMcp(),
            api.getCodexUserInputRequests(),
          ]);

          if (!account.account) {
            pendingLoginId = null;
          }

          return {
            capabilities,
            account: account.account,
            requiresOpenaiAuth: Boolean(account.requiresOpenaiAuth),
            rateLimits: rateLimits.rateLimits ?? null,
            rateLimitsByLimitId: rateLimits.rateLimitsByLimitId ?? null,
            models: models.models,
            threads: threads.data,
            loadedThreadIds: loadedThreads.data,
            features: features.data,
            collaborationModes: normalizeCollaborationModes(collaborationModes),
            mcpServers: mcp.data,
            pendingRequests: pendingRequests.data,
          };
        },
        { onChange: render },
      );
    } catch (error) {
      handleError(state, error, "Failed to load Codex admin data.");
    }
    render();
  }

  async function toggleThreadDetails(threadId: string): Promise<void> {
    if (expandedThreadId === threadId) {
      expandedThreadId = null;
      expandedThreadDetail = undefined;
      render();
      return;
    }
    expandedThreadId = threadId;
    loadingThreadId = threadId;
    render();
    try {
      const response = await api.getCodexThread(threadId, true);
      expandedThreadDetail = response.thread;
    } catch (error) {
      expandedThreadDetail = undefined;
      toast(formatErrorMessage(error, "Failed to load thread details."), "error");
    } finally {
      loadingThreadId = null;
      render();
    }
  }

  async function unsubscribeThread(threadId: string): Promise<void> {
    await runCodexAdminAction(
      async () => {
        await api.postCodexThreadUnsubscribe(threadId);
        if (expandedThreadId === threadId) {
          expandedThreadId = null;
          expandedThreadDetail = undefined;
          loadingThreadId = null;
        }
      },
      "Thread unsubscribed.",
      "Failed to unload thread.",
      load,
    );
  }

  function scheduleRefresh(): void {
    if (refreshTimer !== null) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      void load();
    }, 350);
  }

  function render(): void {
    renderAsyncState(root, state, {
      renderLoading: () => skeletonBlock("240px"),
      renderError: (error) =>
        createEmptyState("Codex admin unavailable", error, "Retry", () => {
          void load();
        }),
      renderEmpty: () =>
        createEmptyState(
          "No Codex admin data",
          "The control plane did not return any admin metadata yet.",
          "Retry",
          () => {
            void load();
          },
        ),
      renderContent: (data) =>
        createLoadedAdmin(
          data,
          pendingLoginId,
          expandedThreadId,
          expandedThreadDetail,
          loadingThreadId,
          (loginId) => {
            pendingLoginId = loginId;
          },
          toggleThreadDetails,
          unsubscribeThread,
          load,
        ),
    });
  }

  const onAnyEvent = (event: Event): void => {
    const detail = (event as CustomEvent<{ type?: string }>).detail;
    if (!detail?.type) return;
    if (detail.type === "codex.event" || detail.type === "codex.server_request") {
      scheduleRefresh();
    }
  };

  window.addEventListener("risoluto:any-event", onAnyEvent);
  registerPageCleanup(root, () => {
    window.removeEventListener("risoluto:any-event", onAnyEvent);
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  });

  render();
  void load();
  return root;
}
