import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ConfigOverlayStore } from "../config/overlay.js";

const DEVICE_AUTH_ENDPOINT = "https://auth0.openai.com/oauth/device/code";
const TOKEN_ENDPOINT = "https://auth0.openai.com/oauth/token";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const SCOPES = "openid profile email offline_access";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

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

export async function startDeviceAuth(): Promise<DeviceCodeResponse> {
  const response = await fetch(DEVICE_AUTH_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CODEX_CLIENT_ID,
      scope: SCOPES,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Device auth request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as DeviceCodeResponse;
}

export async function pollDeviceAuth(
  deviceCode: string,
): Promise<{ status: "pending" | "complete" | "expired"; error?: string }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: CODEX_CLIENT_ID,
      device_code: deviceCode,
    }).toString(),
  });

  if (response.ok) {
    const tokenData = (await response.json()) as TokenResponse;
    return { status: "complete", error: undefined, ...{ tokenData } };
  }

  const errorData = (await response.json()) as TokenErrorResponse;

  if (errorData.error === "authorization_pending" || errorData.error === "slow_down") {
    return { status: "pending" };
  }

  if (errorData.error === "expired_token") {
    return { status: "expired", error: "Device code expired. Please start again." };
  }

  return { status: "expired", error: errorData.error_description ?? errorData.error };
}

export async function saveDeviceAuthTokens(
  deviceCode: string,
  archiveDir: string,
  configOverlayStore: ConfigOverlayStore,
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: CODEX_CLIENT_ID,
      device_code: deviceCode,
    }).toString(),
  });

  if (!response.ok) {
    const errorData = (await response.json()) as TokenErrorResponse;
    return { ok: false, error: errorData.error_description ?? errorData.error };
  }

  const tokenData = (await response.json()) as TokenResponse;

  const authJson = JSON.stringify(
    {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      id_token: tokenData.id_token ?? null,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
    },
    null,
    2,
  );

  const authDir = path.join(archiveDir, "codex-auth");
  await mkdir(authDir, { recursive: true });
  await writeFile(path.join(authDir, "auth.json"), authJson, { encoding: "utf8", mode: 0o600 });

  await configOverlayStore.set("codex.auth.mode", "openai_login");
  await configOverlayStore.set("codex.auth.source_home", authDir);

  return { ok: true };
}
