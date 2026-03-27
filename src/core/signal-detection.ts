/** Shared stop-signal detection used by both the turn executor and worker-outcome handler. */

export type StopSignal = "done" | "blocked";

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
  if (normalized.includes("symphony_status: done") || normalized.includes("symphony status: done")) {
    return "done";
  }
  if (normalized.includes("symphony_status: blocked") || normalized.includes("symphony status: blocked")) {
    return "blocked";
  }
  return null;
}
