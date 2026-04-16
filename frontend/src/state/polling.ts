import { getRuntimeClient } from "./runtime-client.js";

/** Compatibility facade over the unified frontend runtime client. */
export function dismissStaleBanner(): void {
  getRuntimeClient().dismissStaleBanner();
}

export async function pollOnce(): Promise<void> {
  await getRuntimeClient().pollOnce();
}

export function startPolling(): void {
  getRuntimeClient().startPolling();
}

export function stopPolling(): void {
  getRuntimeClient().stopPolling();
}

export function setPollingInterval(ms: number): void {
  getRuntimeClient().setPollingInterval(ms);
}
