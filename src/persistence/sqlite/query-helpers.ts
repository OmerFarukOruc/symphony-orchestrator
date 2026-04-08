/**
 * Clamp a pagination limit to a safe range.
 *
 * Returns 100 when the input is undefined or NaN, otherwise clamps to [1, 500].
 */
export function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return 100;
  }
  return Math.max(1, Math.min(500, Math.trunc(limit)));
}
