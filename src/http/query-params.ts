export function parseLimit(value: unknown): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return null;
  const parsed = Number.parseInt(candidate, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getSingleParam(value: string | string[] | undefined): string | null {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved ?? null;
}
