import { api } from "../api";
import { createButton } from "../components/forms";
import { store } from "../state/store";
import type { AppState } from "../state/store";
import { toast } from "../ui/toast";
import { registerPageCleanup } from "../utils/page";

import { handleObservabilityKeyboard } from "./observability-keyboard";
import { createRawMetricsDrawer } from "./observability-raw-drawer";
import { renderObservabilitySections } from "./observability-sections";
import { createObservabilityState, pushSnapshotTrend } from "./observability-state";

export function createObservabilityPage(): HTMLElement {
  const state = createObservabilityState();
  const page = document.createElement("div");
  page.className = "page observability-page fade-in";
  const header = document.createElement("section");
  header.className = "mc-strip";
  header.innerHTML = `<div><h1 class="page-title">Observability</h1><p class="page-subtitle">Correlate current snapshot health, Prometheus counters, and in-session client trends without leaving the browser.</p></div>`;
  const actions = document.createElement("div");
  actions.className = "mc-actions";
  const sourceBadge = document.createElement("span");
  sourceBadge.className = "mc-badge";
  sourceBadge.textContent = "Sources labeled per widget";
  const drawerButton = createButton("Raw metrics (x)");
  const refreshButton = createButton("Refresh (r)", "primary");
  actions.append(sourceBadge, drawerButton, refreshButton);
  header.append(actions);
  const content = document.createElement("div");
  content.className = "observability-shell";
  const body = document.createElement("main");
  body.className = "observability-body";
  const drawer = createRawMetricsDrawer(() => {
    state.rawDrawerOpen = false;
    render();
  });
  content.append(body, drawer.root);
  page.append(header, content);

  async function loadMetrics(showErrorToast = false): Promise<void> {
    if (state.loadingMetrics && state.metricsFetchedAt > 0) {
      return;
    }
    state.loadingMetrics = true;
    render();
    try {
      state.metricsRaw = await api.getMetrics();
      state.metricsFetchedAt = Date.now();
      state.error = null;
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Failed to load metrics.";
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
      const [snapshot, metrics] = await Promise.all([api.getState(), api.getMetrics()]);
      store.mergeSnapshot(snapshot);
      state.metricsRaw = metrics;
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

  function sync(appState: AppState): void {
    if (appState.snapshot) {
      pushSnapshotTrend(state, appState.snapshot);
    }
    if (Date.now() - state.metricsFetchedAt > 4_000 && !state.refreshing) {
      void loadMetrics();
    }
    render();
  }

  function render(): void {
    refreshButton.disabled = state.refreshing;
    refreshButton.textContent = state.refreshing ? "Refreshing…" : "Refresh (r)";
    drawerButton.textContent = state.rawDrawerOpen ? "Hide raw metrics (x)" : "Raw metrics (x)";
    renderObservabilitySections(body, store.getState().snapshot, store.getState().staleCount, state);
    drawer.render(state.metricsRaw, state.rawDrawerOpen);
  }

  drawerButton.addEventListener("click", () => {
    state.rawDrawerOpen = !state.rawDrawerOpen;
    render();
  });
  refreshButton.addEventListener("click", () => void refreshAll());

  const onState = (event: Event): void => sync((event as CustomEvent<AppState>).detail);
  const onKey = (event: KeyboardEvent): void => {
    handleObservabilityKeyboard(event, {
      onRefresh: () => void refreshAll(),
      onToggleRawDrawer: () => {
        state.rawDrawerOpen = !state.rawDrawerOpen;
        render();
      },
    });
  };

  window.addEventListener("state:update", onState);
  window.addEventListener("keydown", onKey);
  sync(store.getState());
  void loadMetrics();
  registerPageCleanup(page, () => {
    window.removeEventListener("state:update", onState);
    window.removeEventListener("keydown", onKey);
  });
  return page;
}
