import { api } from "../api";
import { store } from "./store";

const STALE_THRESHOLD = 3;

let intervalId: number | null = null;
let inFlight = false;

function updateBanner(): void {
  const banner = document.getElementById("stale-banner");
  if (!banner) {
    return;
  }
  const isVisible = store.getState().staleCount >= STALE_THRESHOLD;
  banner.hidden = !isVisible;
  banner.classList.toggle("is-visible", isVisible);
}

function isDocumentHidden(): boolean {
  return typeof document.hidden === "boolean" && document.hidden;
}

async function pollOnce(): Promise<void> {
  if (inFlight || isDocumentHidden()) {
    updateBanner();
    return;
  }
  inFlight = true;
  try {
    const data = await api.getState();
    store.mergeSnapshot(data, { resetStale: true });
  } catch {
    store.incrementStale();
  } finally {
    inFlight = false;
    updateBanner();
  }
}

function handleVisibilityChange(): void {
  if (!isDocumentHidden()) {
    void pollOnce();
  }
}

export function startPolling(): void {
  if (intervalId !== null) {
    return;
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
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
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}
