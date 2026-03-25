/**
 * Structured logger interface used throughout Symphony.
 *
 * All call sites pass metadata as the first argument and an optional
 * human-readable message as the second.  Implementations must accept
 * both `(string)` and `(Record<string, unknown>, string?)` call styles.
 */
export interface SymphonyLogger {
  debug(meta: unknown, message?: string): void;
  info(meta: unknown, message?: string): void;
  warn(meta: unknown, message?: string): void;
  error(meta: unknown, message?: string): void;
  child(meta: Record<string, unknown>): SymphonyLogger;
}
//# sourceMappingURL=logger.d.ts.map
