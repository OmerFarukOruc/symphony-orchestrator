const READ_TOKEN_STORAGE_KEY = "risoluto.readToken";
const WRITE_TOKEN_STORAGE_KEY = "risoluto.writeToken";
const OPERATOR_TOKEN_STORAGE_KEY = "risoluto.operatorToken";

function canUseBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function bootstrapAccessTokensFromUrl(): void {
  if (!canUseBrowserStorage() || typeof window.location === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  let changed = false;

  const operatorToken = url.searchParams.get("operator_token")?.trim();
  if (operatorToken) {
    window.sessionStorage.setItem(OPERATOR_TOKEN_STORAGE_KEY, operatorToken);
    url.searchParams.delete("operator_token");
    changed = true;
  }

  const readToken = url.searchParams.get("read_token")?.trim();
  if (readToken) {
    window.sessionStorage.setItem(READ_TOKEN_STORAGE_KEY, readToken);
    url.searchParams.delete("read_token");
    changed = true;
  }

  const writeToken = url.searchParams.get("write_token")?.trim();
  if (writeToken) {
    window.sessionStorage.setItem(WRITE_TOKEN_STORAGE_KEY, writeToken);
    url.searchParams.delete("write_token");
    changed = true;
  }

  if (changed && typeof window.history?.replaceState === "function") {
    const nextPath = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", nextPath || "/");
  }
}

function readStoredToken(key: string): string | null {
  if (!canUseBrowserStorage()) {
    return null;
  }
  const token = window.sessionStorage.getItem(key);
  return token && token.trim().length > 0 ? token.trim() : null;
}

function getDedicatedReadToken(): string | null {
  bootstrapAccessTokensFromUrl();
  return readStoredToken(READ_TOKEN_STORAGE_KEY);
}

export function getReadAccessToken(): string | null {
  bootstrapAccessTokensFromUrl();
  return (
    readStoredToken(OPERATOR_TOKEN_STORAGE_KEY) ??
    readStoredToken(READ_TOKEN_STORAGE_KEY) ??
    readStoredToken(WRITE_TOKEN_STORAGE_KEY)
  );
}

export function getWriteAccessToken(): string | null {
  bootstrapAccessTokensFromUrl();
  return readStoredToken(OPERATOR_TOKEN_STORAGE_KEY) ?? readStoredToken(WRITE_TOKEN_STORAGE_KEY);
}

export function buildReadTokenQueryParam(): string {
  const token = getDedicatedReadToken();
  return token ? `read_token=${encodeURIComponent(token)}` : "";
}
