import { api } from "../api";
import { store } from "./store";

let intervalId: number | null = null;

function updateBanner(): void {
  const banner = document.getElementById("stale-banner");
  if (!banner) {
    return;
  }
  const isVisible = store.getState().staleCount >= 3;
  banner.hidden = !isVisible;
  banner.classList.toggle("is-visible", isVisible);
}

async function pollOnce(): Promise<void> {
  try {
    const data = await api.getState();
    store.mergeSnapshot(data);
    store.resetStale();
  } catch {
    store.incrementStale();
  }
  updateBanner();
}

export function startPolling(): void {
  if (intervalId !== null) {
    return;
  }
  void pollOnce();
  intervalId = window.setInterval(() => {
    void pollOnce();
  }, 5_000);
}

export function stopPolling(): void {
  if (intervalId === null) {
    return;
  }
  window.clearInterval(intervalId);
  intervalId = null;
}
