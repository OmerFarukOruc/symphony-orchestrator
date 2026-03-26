import { randomBytes, createHash } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ConfigOverlayStore } from "../config/overlay.js";
import { buildCodexAuthRecord } from "../codex/auth-file.js";

const AUTH_ENDPOINT = "https://auth.openai.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const SCOPES = "openid profile email offline_access";
/** Must match the registered redirect URI for CODEX_CLIENT_ID. */
const CALLBACK_PORT = 1455;
const CALLBACK_REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/auth/callback`;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

export interface PkceSession {
  codeVerifier: string;
  state: string;
  authUrl: string;
  redirectUri: string;
  createdAt: number;
  authCode: string | null;
  error: string | null;
  complete: boolean;
  callbackServer: Server | null;
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Create a new PKCE auth session and return the authorization URL.
 * Uses the hardcoded redirect URI registered with the Codex client ID.
 */
export function createPkceSession(): PkceSession {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const params = new URLSearchParams({
    client_id: CODEX_CLIENT_ID,
    redirect_uri: CALLBACK_REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    response_type: "code",
    state,
    codex_cli_simplified_flow: "true",
    originator: "codex_cli_rs",
  });

  return {
    codeVerifier,
    state,
    authUrl: `${AUTH_ENDPOINT}?${params.toString()}`,
    redirectUri: CALLBACK_REDIRECT_URI,
    createdAt: Date.now(),
    authCode: null,
    error: null,
    complete: false,
    callbackServer: null,
  };
}

/**
 * Start a temporary HTTP server on port 1455 to receive the OAuth callback.
 * Retries once after a short delay if the port is still in use from a previous session.
 */
export async function startCallbackServer(session: PkceSession): Promise<void> {
  try {
    await listenOnCallbackPort(session);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      // Previous session's server may still be closing — wait and retry once
      await new Promise((r) => setTimeout(r, 500));
      await listenOnCallbackPort(session);
    } else {
      throw error;
    }
  }
}

function listenOnCallbackPort(session: PkceSession): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      handleCallbackRequest(req, res, session);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        session.error = `Port ${CALLBACK_PORT} is already in use. Close any running Codex CLI and try again.`;
      } else {
        session.error = `Callback server error: ${error.message}`;
      }
      reject(error);
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      session.callbackServer = server;
      resolve();
    });
  });
}

function handleCallbackRequest(req: IncomingMessage, res: ServerResponse, session: PkceSession): void {
  const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);

  if (url.pathname !== "/auth/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (errorParam) {
    session.error = errorDescription ?? errorParam;
    respondWithHtml(res, false, session.error);
    shutdownCallbackServer(session);
    return;
  }

  if (!code || !state) {
    session.error = "Missing authorization code or state.";
    respondWithHtml(res, false, session.error);
    return;
  }

  if (state !== session.state) {
    session.error = "Invalid state parameter. Possible CSRF attack.";
    respondWithHtml(res, false, session.error);
    return;
  }

  session.authCode = code;
  respondWithHtml(res, true, null);
  // Token exchange happens in the handler that polls status
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

function respondWithHtml(res: ServerResponse, success: boolean, errorMessage: string | null): void {
  const title = success ? "Authentication Successful" : "Authentication Failed";
  const body = success
    ? "<h2>✓ Signed in successfully!</h2><p>You can close this window and return to the Symphony setup wizard.</p>"
    : `<h2>Authentication Failed</h2><p>${escapeHtml(errorMessage ?? "Unknown error")}</p><p>Close this window and try again.</p>`;
  const color = success ? "#22c55e" : "#ef4444";

  const html = `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0}
.card{text-align:center;padding:3rem;border-radius:12px;background:#16213e;border:1px solid ${color}30;max-width:400px}
h2{color:${color}}</style></head>
<body><div class="card">${body}</div>
<script>setTimeout(()=>window.close(),3000)</script></body></html>`;

  res.writeHead(success ? 200 : 400, {
    "content-type": "text/html",
    "access-control-allow-origin": "*",
  });
  res.end(html);
}

/** Gracefully shut down the callback server. */
export function shutdownCallbackServer(session: PkceSession): void {
  if (session.callbackServer) {
    session.callbackServer.close();
    session.callbackServer = null;
  }
}

/**
 * Exchange an authorization code for tokens using the PKCE code verifier.
 */
export async function exchangePkceCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CODEX_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as TokenErrorResponse;
    throw new Error(errorData.error_description ?? errorData.error ?? `Token exchange failed (${response.status})`);
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Save the OAuth tokens as auth.json and update the config overlay.
 */
export async function savePkceAuthTokens(
  tokenData: TokenResponse,
  archiveDir: string,
  configOverlayStore: ConfigOverlayStore,
): Promise<void> {
  const authJson = JSON.stringify(
    buildCodexAuthRecord({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      id_token: tokenData.id_token ?? null,
      account_id: null,
    }),
    null,
    2,
  );

  const authDir = path.join(archiveDir, "codex-auth");
  await mkdir(authDir, { recursive: true });
  await writeFile(path.join(authDir, "auth.json"), authJson, { encoding: "utf8", mode: 0o600 });

  await configOverlayStore.set("codex.auth.mode", "openai_login");
  await configOverlayStore.set("codex.auth.source_home", authDir);
  await configOverlayStore.delete("codex.provider");
}

/**
 * Pre-flight check: verify that auth.openai.com is reachable before
 * opening the browser auth flow. Returns null on success, or an error message.
 */
export async function checkAuthEndpointReachable(): Promise<string | null> {
  try {
    const response = await fetch(AUTH_ENDPOINT, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    // Any HTTP response (even 4xx) means the endpoint is reachable
    if (response.status >= 500) {
      return `OpenAI auth endpoint returned ${response.status}. Please try again later.`;
    }
    return null;
  } catch {
    return "Cannot reach auth.openai.com — check your network connection and try again.";
  }
}
