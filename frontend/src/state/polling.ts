import { api } from "../api";
import { exponentialBackoff } from "../utils/backoff.js";
import { store } from "./store";

const STALE_THRESHOLD = 3;
const MAX_BACKOFF_MS = 60_000;
const BASE_POLL_MS = 5_000;

let intervalId: number | null = null;
let inFlight = false;
let bannerDismissed = false;

function backoffInterval(): number {
  const staleCount = store.getState().staleCount;
  if (staleCount <= STALE_THRESHOLD) return BASE_POLL_MS;
  return exponentialBackoff(staleCount - STALE_THRESHOLD, BASE_POLL_MS, MAX_BACKOFF_MS);
}

/** Dismiss the stale banner until the next successful poll. */
export function dismissStaleBanner(): void {
  bannerDismissed = true;
  const banner = document.getElementById("stale-banner");
  if (banner) {
    banner.hidden = true;
    banner.classList.remove("is-visible");
  }
}

function updateBanner(): void {
  const banner = document.getElementById("stale-banner");
  if (!banner) {
    return;
  }
  const staleCount = store.getState().staleCount;
  const isVisible = staleCount >= STALE_THRESHOLD && !bannerDismissed;
  banner.hidden = !isVisible;
  banner.classList.toggle("is-visible", isVisible);

  // Update banner text with backoff info
  if (isVisible) {
    const intervalSec = Math.round(backoffInterval() / 1000);
    const msgEl = banner.querySelector(".stale-banner-message");
    if (msgEl) {
      msgEl.textContent = `State feed is stale \u2014 retrying every ${intervalSec}s.`;
    }
  }

  // Reset dismiss flag on successful connection
  if (staleCount === 0) {
    bannerDismissed = false;
  }
}

function isDocumentHidden(): boolean {
  return typeof document.hidden === "boolean" && document.hidden;
}

export async function pollOnce(): Promise<void> {
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
    // Apply exponential backoff on consecutive failures
    if (intervalId !== null) {
      const nextInterval = backoffInterval();
      window.clearInterval(intervalId);
      intervalId = window.setInterval(() => {
        void pollOnce();
      }, nextInterval);
    }
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

/**
 * Adjust the polling cadence at runtime. Used by the SSE event source
 * to slow polling while the live feed is connected (30 s) and restore
 * the default (5 s) when disconnected.
 */
export function setPollingInterval(ms: number): void {
  if (intervalId === null) return;
  window.clearInterval(intervalId);
  intervalId = window.setInterval(() => {
    void pollOnce();
  }, ms);
}
