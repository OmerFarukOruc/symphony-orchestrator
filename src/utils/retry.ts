import { randomInt } from "node:crypto";
import { toErrorString } from "./type-guards.js";
import type { RisolutoLogger } from "../core/types.js";

export interface RetryOptions {
  /** Maximum number of attempts (default: 3). */
  maxAttempts?: number;
}

/**
 * Retry a void-returning operation with jittered exponential backoff.
 * On final failure the error is swallowed and logged as a warning (non-fatal).
 */
export async function withRetry(
  logger: RisolutoLogger,
  operation: string,
  fn: () => Promise<void>,
  options?: RetryOptions,
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        logger.warn(
          { operation, attempt, error: toErrorString(error) },
          "write-back failed after max retries (non-fatal)",
        );
        return;
      }
      const delayMs = 1000 * 2 ** (attempt - 1) * (randomInt(500, 1000) / 1000);
      logger.warn({ operation, attempt, delayMs, error: toErrorString(error) }, "write-back retry");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Retry a value-returning operation with jittered exponential backoff.
 * On final failure the error is re-thrown.
 */
export async function withRetryReturn<T>(
  logger: RisolutoLogger,
  operation: string,
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      const delayMs = 1000 * 2 ** (attempt - 1) * (randomInt(500, 1000) / 1000);
      logger.warn({ operation, attempt, delayMs, error: toErrorString(error) }, "write-back retry");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  /* c8 ignore next -- unreachable: loop always returns or throws */
  throw new Error(`${operation} exhausted retries without result`);
}
