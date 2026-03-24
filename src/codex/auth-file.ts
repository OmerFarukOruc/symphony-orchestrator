import { asRecord, asStringOrNull as asString } from "../utils/type-guards.js";

const DEFAULT_AUTH_MODE = "chatgpt";
const FLAT_TOKEN_KEYS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "account_id",
  "token_type",
  "expires_in",
]);

interface CodexAuthTokens {
  access_token: string;
  refresh_token: string | null;
  id_token: string | null;
  account_id: string | null;
}

interface BuildCodexAuthRecordOptions {
  authMode?: string;
  extraTopLevel?: Record<string, unknown>;
  lastRefresh?: string;
}

function normalizeTokenValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractTokenSource(record: Record<string, unknown>): Record<string, unknown> | null {
  const nestedTokens = asRecord(record.tokens);
  if (normalizeTokenValue(nestedTokens.access_token)) {
    return nestedTokens;
  }
  return normalizeTokenValue(record.access_token) ? record : null;
}

function extractTokens(record: Record<string, unknown>): CodexAuthTokens | null {
  const tokenSource = extractTokenSource(record);
  const accessToken = normalizeTokenValue(tokenSource?.access_token);
  if (!accessToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: normalizeTokenValue(tokenSource?.refresh_token),
    id_token: normalizeTokenValue(tokenSource?.id_token),
    account_id: normalizeTokenValue(tokenSource?.account_id),
  };
}

export function buildCodexAuthRecord(
  tokens: CodexAuthTokens,
  options: BuildCodexAuthRecordOptions = {},
): Record<string, unknown> {
  return {
    ...(options.extraTopLevel ?? {}),
    auth_mode: options.authMode ?? DEFAULT_AUTH_MODE,
    last_refresh: options.lastRefresh ?? new Date().toISOString(),
    tokens,
  };
}

export function normalizeCodexAuthRecord(
  value: unknown,
  options: { lastRefresh?: string } = {},
): Record<string, unknown> {
  const record = asRecord(value);
  const tokens = extractTokens(record);
  if (!tokens) {
    return record;
  }

  const extraTopLevel = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== "tokens" && key !== "auth_mode" && key !== "last_refresh" && !FLAT_TOKEN_KEYS.has(key),
    ),
  );

  return buildCodexAuthRecord(tokens, {
    authMode: asString(record.auth_mode) ?? DEFAULT_AUTH_MODE,
    extraTopLevel,
    lastRefresh: asString(record.last_refresh) ?? options.lastRefresh,
  });
}

export function normalizeCodexAuthJson(authJson: string, options: { lastRefresh?: string } = {}): string {
  const normalized = normalizeCodexAuthRecord(JSON.parse(authJson) as unknown, options);
  return JSON.stringify(normalized, null, 2);
}

export function readCodexAuthTokens(value: unknown): CodexAuthTokens | null {
  return extractTokens(asRecord(value));
}
