import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const REQUEST_ID_HEADER = "X-Request-ID";
const requestTraceStorage = new AsyncLocalStorage<{ requestId: string }>();

/**
 * Generate or propagate a request trace ID.
 *
 * If the incoming headers carry an `X-Request-ID`, it is preserved;
 * otherwise a new UUID v4 is generated.
 */
export function resolveRequestId(incomingHeader: string | string[] | undefined): string {
  if (typeof incomingHeader === "string" && incomingHeader.length > 0) {
    return incomingHeader;
  }
  return randomUUID();
}

export function runWithRequestContext<T>(requestId: string, callback: () => T): T {
  return requestTraceStorage.run({ requestId }, callback);
}

export function getRequestId(): string | null {
  return requestTraceStorage.getStore()?.requestId ?? null;
}

export { REQUEST_ID_HEADER };
