/**
 * Token expiry detection and automatic refresh for OpenAI auth tokens.
 *
 * Symphony stores OpenAI credentials in auth.json. This module checks
 * whether the access_token has expired (or will expire soon) and uses
 * the stored refresh_token to obtain a fresh access_token transparently
 * before dispatching Codex workers.
 */

import { readFile, writeFile } from "node:fs/promises";

const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/** Safety margin — refresh if the token expires within this many milliseconds. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Error thrown when token refresh fails — carries a machine-readable code. */
export class TokenRefreshError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TokenRefreshError";
    this.code = code;
  }
}

interface AuthJson {
  access_token: string;
  refresh_token?: string | null;
  id_token?: string | null;
  token_type?: string;
  expires_in?: number;
  expired?: string;
  [key: string]: unknown;
}

interface TokenRefreshResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

interface TokenErrorResponse {
  error: string | { message?: string; code?: string };
  error_description?: string;
}

/**
 * Check whether the auth token in the given JSON string is expired
 * or will expire within the safety margin.
 *
 * Checks the `expired` field first (ISO date string from Codex CLI),
 * then falls back to decoding the JWT `exp` claim from the access_token.
 * Returns `false` (assume valid) if expiry cannot be determined.
 */
export function isTokenExpired(authJsonStr: string): boolean {
  let auth: AuthJson;
  try {
    auth = JSON.parse(authJsonStr) as AuthJson;
  } catch {
    return false;
  }

  const now = Date.now();

  // Check the `expired` field (ISO string set by Codex CLI)
  if (auth.expired && typeof auth.expired === "string") {
    const expiryTime = new Date(auth.expired).getTime();
    if (!Number.isNaN(expiryTime)) {
      return now >= expiryTime - EXPIRY_MARGIN_MS;
    }
  }

  // Fallback: decode the JWT exp claim from access_token
  if (auth.access_token) {
    const exp = extractJwtExp(auth.access_token);
    if (exp !== null) {
      return now >= exp * 1000 - EXPIRY_MARGIN_MS;
    }
  }

  // Cannot determine expiry — assume valid
  return false;
}

/**
 * Extract the `exp` claim from a JWT without verifying the signature.
 * Returns the expiry as a Unix timestamp (seconds), or null on failure.
 */
function extractJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Refresh the access token using the stored refresh_token.
 *
 * Reads auth.json, exchanges the refresh_token for a new access_token
 * via the OpenAI token endpoint, writes the updated auth.json back to
 * disk, and returns the updated JSON string.
 *
 * Throws if no refresh_token is available or if the refresh request fails.
 */
export async function refreshAccessToken(authJsonPath: string): Promise<string> {
  const raw = await readFile(authJsonPath, "utf8");
  const auth = JSON.parse(raw) as AuthJson;

  if (!auth.refresh_token) {
    throw new TokenRefreshError(
      "auth_token_expired",
      "Cannot refresh token: no refresh_token in auth.json. Please re-authenticate via the setup wizard.",
    );
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CODEX_CLIENT_ID,
      refresh_token: auth.refresh_token,
    }).toString(),
  });

  const responseText = await response.text();

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorData = JSON.parse(responseText) as TokenErrorResponse;
      if (typeof errorData.error === "string") {
        errorMessage = errorData.error_description ?? errorData.error;
      } else if (typeof errorData.error === "object" && errorData.error !== null) {
        errorMessage = errorData.error.message ?? errorData.error.code ?? errorMessage;
      }
    } catch {
      errorMessage = responseText || errorMessage;
    }
    throw new TokenRefreshError("auth_token_expired", `Token refresh failed: ${errorMessage}. Please re-authenticate via the setup wizard.`);
  }

  const tokenData = JSON.parse(responseText) as TokenRefreshResponse;

  const updatedAuth: AuthJson = {
    ...auth,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? auth.refresh_token,
    id_token: tokenData.id_token ?? auth.id_token,
    token_type: tokenData.token_type,
    expires_in: tokenData.expires_in,
    expired: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  };

  const updatedJson = JSON.stringify(updatedAuth);
  await writeFile(authJsonPath, updatedJson, { encoding: "utf8", mode: 0o600 });

  return updatedJson;
}
