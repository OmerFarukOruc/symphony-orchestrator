/** Calculate exponential backoff delay: base * 2^(failures-1), capped at max. */
export function exponentialBackoff(failures: number, baseMs: number, maxMs: number): number {
  if (failures <= 0) return baseMs;
  return Math.min(baseMs * 2 ** (failures - 1), maxMs);
}
