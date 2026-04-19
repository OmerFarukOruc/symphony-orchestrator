export type LogsMode = "live" | "archive";

/**
 * Both `/issues/:id/logs` and `/logs/:id` default to live mode so the operator
 * always opens on the active stream. The History toggle in the page header
 * switches to archive mode on demand.
 */
export function resolveInitialLogsMode(_pathname: string): LogsMode {
  return "live";
}

export function shouldFallbackToArchive(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Unknown issue identifier");
}
