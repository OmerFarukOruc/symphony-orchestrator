import { api } from "../api";
import { createButton } from "../components/forms";
import { createPageHeader } from "../components/page-header";
import { getRuntimeClient } from "../state/runtime-client";
import type { AppState } from "../state/store";
import { toast } from "../ui/toast";
import { flashDiff } from "../utils/diff";
import { registerPageCleanup } from "../utils/page";

import { handleObservabilityKeyboard } from "./observability-keyboard";
import { createRawMetricsDrawer } from "./observability-raw-drawer";
import { renderObservabilitySections } from "./observability-sections";
import { createObservabilityState } from "./observability-state";

export function createObservabilityPage(): HTMLElement {
  const runtimeClient = getRuntimeClient();
  const state = createObservabilityState();
  const page = document.createElement("div");
  page.className = "page observability-page fade-in";
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  const drawerButton = createButton("Raw metrics (x)");
  const refreshButton = createButton("Refresh (r)", "primary");
  actions.append(drawerButton, refreshButton);
  const header = createPageHeader(
    "Observability",
    "Flight recorder for the Risoluto runtime — every health surface, component counter, and trace in chronological order.",
    { actions },
  );
  const content = document.createElement("div");
  content.className = "observability-shell";
  const body = document.createElement("section");
  body.className = "observability-body";
  const drawer = createRawMetricsDrawer(() => {
    state.rawDrawerOpen = false;
    render();
  });
  content.append(body, drawer.root);
  page.append(header, content);

  async function loadObservability(showErrorToast = false): Promise<void> {
    if (state.loadingMetrics && state.metricsFetchedAt > 0) {
      return;
    }
    state.loadingMetrics = true;
    render();
    try {
      state.summary = await api.getObservability();
      state.metricsRaw = state.summary.raw_metrics;
      state.metricsFetchedAt = Date.now();
      runtimeClient.mergeSnapshot(state.summary.runtime_state);
      state.error = null;
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to load observability.";
      if (showErrorToast) {
        toast(state.error, "error");
      }
    } finally {
      state.loadingMetrics = false;
      render();
    }
  }

  async function refreshAll(): Promise<void> {
    if (state.refreshing) {
      return;
    }
    state.refreshing = true;
    render();
    try {
      await api.postRefresh().catch(() => undefined);
      state.summary = await api.getObservability();
      runtimeClient.mergeSnapshot(state.summary.runtime_state, { resetStale: true });
      state.metricsRaw = state.summary.raw_metrics;
      state.metricsFetchedAt = Date.now();
      state.error = null;
      toast("Observability refreshed.", "success");
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to refresh observability.";
      toast(state.error, "error");
    } finally {
      state.refreshing = false;
      state.loadingMetrics = false;
      render();
    }
  }

  function sync(_appState: AppState): void {
    if (Date.now() - state.metricsFetchedAt > 4_000 && !state.refreshing) {
      void loadObservability();
    }
    render();
  }

  function render(): void {
    refreshButton.disabled = state.refreshing;
    refreshButton.textContent = state.refreshing ? "Refreshing…" : "Refresh (r)";
    drawerButton.textContent = state.rawDrawerOpen ? "Hide raw metrics (x)" : "Raw metrics (x)";
    renderObservabilitySections(
      body,
      state.summary?.runtime_state ?? runtimeClient.getAppState().snapshot,
      runtimeClient.getAppState().staleCount,
      state,
      {
        onRefresh: () => void refreshAll(),
      },
    );
    drawer.render(state.metricsRaw, state.rawDrawerOpen);
  }

  drawerButton.addEventListener("click", () => {
    state.rawDrawerOpen = !state.rawDrawerOpen;
    render();
  });
  refreshButton.addEventListener("click", () => void refreshAll());

  const onState = (nextState: AppState): void => sync(nextState);
  const onKey = (event: KeyboardEvent): void => {
    handleObservabilityKeyboard(event, {
      onRefresh: () => void refreshAll(),
      onToggleRawDrawer: () => {
        state.rawDrawerOpen = !state.rawDrawerOpen;
        render();
      },
    });
  };

  const onPollComplete = (): void => {
    void loadObservability().then(() => flashDiff(body));
  };

  const unsubscribeState = runtimeClient.subscribeState(onState, { includeHeartbeat: true });
  const unsubscribePollComplete = runtimeClient.subscribePollComplete(onPollComplete);
  window.addEventListener("keydown", onKey);
  sync(runtimeClient.getAppState());
  void loadObservability();
  registerPageCleanup(page, () => {
    unsubscribeState();
    unsubscribePollComplete();
    window.removeEventListener("keydown", onKey);
  });
  return page;
}
