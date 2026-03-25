import { randomUUID } from "node:crypto";

const REQUEST_ID_HEADER = "X-Request-ID";

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

export { REQUEST_ID_HEADER };
