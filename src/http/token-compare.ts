import { timingSafeEqual } from "node:crypto";

export function tokensMatch(supplied: string | null | undefined, expected: string): boolean {
  if (!supplied || supplied.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function includesMatchingToken(supplied: string | null | undefined, expectedTokens: readonly string[]): boolean {
  if (!supplied) {
    return false;
  }

  return expectedTokens.some((token) => tokensMatch(supplied, token));
}
