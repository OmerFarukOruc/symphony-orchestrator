/**
 * Deduplicated toast utility for SSE system event notifications.
 *
 * Wraps the base `toast()` call with a time-windowed deduplication set
 * so that identical messages arriving within DEDUP_WINDOW_MS are dropped.
 * This prevents toast flooding when the backend emits rapid-fire events
 * (e.g. repeated worker failures for the same issue).
 */

import { toast } from "../ui/toast.js";
import type { ToastType } from "../ui/toast.js";

const recentMessages = new Set<string>();
const DEDUP_WINDOW_MS = 10_000;

export function deduplicatedToast(message: string, type: ToastType): void {
  if (recentMessages.has(message)) return;
  recentMessages.add(message);
  setTimeout(() => recentMessages.delete(message), DEDUP_WINDOW_MS);
  toast(message, type);
}
