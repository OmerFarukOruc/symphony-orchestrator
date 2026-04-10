import { asRecord, asString } from "./helpers.js";

export interface CodexErrorInfo {
  type: string;
  message: string;
  retryAfterMs?: number;
}

export function extractCodexErrorInfo(errorRecord: Record<string, unknown>): CodexErrorInfo | null {
  const info = asRecord(errorRecord.codexErrorInfo);
  const infoType = asString(info.type);
  if (infoType) {
    return {
      type: infoType,
      message: asString(info.message) ?? infoType,
      retryAfterMs: typeof info.retryAfterMs === "number" ? info.retryAfterMs : undefined,
    };
  }
  const errorType = asString(errorRecord.type);
  if (errorType) {
    return {
      type: errorType,
      message: asString(errorRecord.message) ?? errorType,
      retryAfterMs: typeof errorRecord.retryAfterMs === "number" ? errorRecord.retryAfterMs : undefined,
    };
  }
  return null;
}
