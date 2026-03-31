/** Shared stop-signal detection used by both the turn executor and worker-outcome handler. */

export type StopSignal = "done" | "blocked";

const DONE_MARKERS = [
  "risoluto_status: done",
  "risoluto status: done",
  "symphony_status: done",
  "symphony status: done",
] as const;

const BLOCKED_MARKERS = [
  "risoluto_status: blocked",
  "risoluto status: blocked",
  "symphony_status: blocked",
  "symphony status: blocked",
] as const;

function normalizeForDetection(content: string): string {
  return content.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

export function detectStopSignal(content: string | null): StopSignal | null {
  if (!content) {
    return null;
  }

  // Try structured JSON first (outputSchema responses)
  try {
    const parsed: unknown = JSON.parse(content.trim());
    if (parsed && typeof parsed === "object" && "status" in parsed) {
      const status = String((parsed as Record<string, unknown>).status).toUpperCase();
      if (status === "DONE") return "done";
      if (status === "BLOCKED") return "blocked";
    }
  } catch {
    // Not JSON — fall through to text pattern matching
  }

  const normalized = normalizeForDetection(content);
  if (DONE_MARKERS.some((marker) => normalized.includes(marker))) {
    return "done";
  }
  if (BLOCKED_MARKERS.some((marker) => normalized.includes(marker))) {
    return "blocked";
  }
  return null;
}
