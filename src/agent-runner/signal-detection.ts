/** Shared stop-signal detection used by both the turn executor and worker-outcome handler. */

export type StopSignal = "done" | "blocked";

function normalizeForDetection(content: string): string {
  return content.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

export function detectStopSignal(content: string | null): StopSignal | null {
  if (!content) {
    return null;
  }

  const normalized = normalizeForDetection(content);
  if (normalized.includes("symphony_status: done") || normalized.includes("symphony status: done")) {
    return "done";
  }
  if (normalized.includes("symphony_status: blocked") || normalized.includes("symphony status: blocked")) {
    return "blocked";
  }
  return null;
}
