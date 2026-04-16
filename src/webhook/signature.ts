import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyLinearSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function verifyGitHubSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const normalized = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== normalized.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
}
