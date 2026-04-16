import { createEmptyState } from "../../components/empty-state.js";
import { toast } from "../../ui/toast.js";
import type { CodexAccountResponse, CodexRateLimitBucket, CodexRateLimitsResponse } from "../../types/codex.js";
import {
  cancelCodexBrowserLogin,
  logoutCodexAccount,
  startCodexApiKeyLogin,
  startCodexBrowserLogin,
} from "./codex-admin-client.js";
import {
  createMetric,
  createPanel,
  formatErrorMessage,
  formatUnixSeconds,
  runCodexAdminAction,
} from "./codex-admin-helpers.js";

interface PrimaryRateLimitSummary {
  available: boolean;
  name: string;
  usedPercent: number | null;
  resetsAt: number | null;
  windowDurationMins: number | null;
}

const EMPTY_PRIMARY_RATE_LIMIT: PrimaryRateLimitSummary = {
  available: false,
  name: "Primary",
  usedPercent: null,
  resetsAt: null,
  windowDurationMins: null,
};

function describeAccount(account: CodexAccountResponse["account"]): string {
  if (!account?.type) return "Signed out";
  if (account.type === "apiKey") return "API key";
  if (account.type === "chatgpt") return "ChatGPT managed";
  if (account.type === "chatgptAuthTokens") return "ChatGPT external tokens";
  return account.type;
}

function summarizeRateLimitBucket(bucket: CodexRateLimitBucket | null | undefined): PrimaryRateLimitSummary {
  if (!bucket?.primary) {
    return EMPTY_PRIMARY_RATE_LIMIT;
  }
  return {
    available: true,
    name: bucket.limitName || bucket.limitId || "Primary",
    usedPercent: bucket.primary.usedPercent ?? null,
    resetsAt: bucket.primary.resetsAt ?? null,
    windowDurationMins: bucket.primary.windowDurationMins ?? null,
  };
}

function primaryRateLimit(
  rateLimits: CodexRateLimitsResponse["rateLimits"],
  rateLimitsByLimitId: CodexRateLimitsResponse["rateLimitsByLimitId"],
): PrimaryRateLimitSummary {
  const directBucket = summarizeRateLimitBucket(rateLimits);
  if (directBucket.available) {
    return directBucket;
  }
  const firstBucket = rateLimitsByLimitId ? Object.values(rateLimitsByLimitId)[0] : null;
  return summarizeRateLimitBucket(firstBucket);
}

function buildApiKeyButton(onRefresh: () => Promise<void>): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button is-ghost";
  button.textContent = "Use API key";
  button.addEventListener("click", () => {
    const apiKey = globalThis.prompt?.("Enter an OpenAI API key", "");
    if (!apiKey) return;
    void runCodexAdminAction(
      async () => {
        await startCodexApiKeyLogin(apiKey);
      },
      "API key login saved.",
      "Failed to save API key login.",
      onRefresh,
    );
  });
  return button;
}

function buildBrowserLoginButton(
  onPendingLoginIdChange: (loginId: string | null) => void,
  onRefresh: () => Promise<void>,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button is-ghost";
  button.textContent = "Browser login";
  button.addEventListener("click", () => {
    void (async () => {
      try {
        const result = await startCodexBrowserLogin();
        onPendingLoginIdChange(result.loginId ?? null);
        if (result.authUrl) {
          globalThis.open?.(result.authUrl, "_blank", "noopener");
        }
        toast("Browser login started.", "success");
        await onRefresh();
      } catch (error) {
        toast(formatErrorMessage(error, "Failed to start browser login."), "error");
      }
    })();
  });
  return button;
}

function buildCancelLoginButton(
  pendingLoginId: string,
  onPendingLoginIdChange: (loginId: string | null) => void,
  onRefresh: () => Promise<void>,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button is-ghost";
  button.textContent = "Cancel login";
  button.addEventListener("click", () => {
    void runCodexAdminAction(
      async () => {
        await cancelCodexBrowserLogin(pendingLoginId);
        onPendingLoginIdChange(null);
      },
      "Pending login cancelled.",
      "Failed to cancel browser login.",
      onRefresh,
    );
  });
  return button;
}

function buildLogoutButton(
  onPendingLoginIdChange: (loginId: string | null) => void,
  onRefresh: () => Promise<void>,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mc-button is-ghost";
  button.textContent = "Logout";
  button.addEventListener("click", () => {
    void runCodexAdminAction(
      async () => {
        await logoutCodexAccount();
        onPendingLoginIdChange(null);
      },
      "Codex account logged out.",
      "Failed to log out Codex account.",
      onRefresh,
    );
  });
  return button;
}

function renderRateLimitBuckets(
  rateLimits: CodexRateLimitsResponse["rateLimits"],
  rateLimitsByLimitId: CodexRateLimitsResponse["rateLimitsByLimitId"],
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "codex-admin-request-list";
  const buckets = rateLimitsByLimitId ? Object.values(rateLimitsByLimitId) : rateLimits ? [rateLimits] : [];
  if (buckets.length === 0) {
    wrap.append(
      createEmptyState("No quota data", "The connected Codex account did not report any rate-limit buckets yet."),
    );
    return wrap;
  }
  for (const bucket of buckets.slice(0, 4)) {
    const item = document.createElement("div");
    item.className = "codex-admin-request";
    const title = document.createElement("strong");
    title.textContent = bucket.limitName || bucket.limitId || "Rate-limit bucket";
    const meta = document.createElement("p");
    meta.className = "text-secondary";
    const used = bucket.primary?.usedPercent;
    const windowMins = bucket.primary?.windowDurationMins;
    meta.textContent = `${used ?? "\u2014"}% used • ${windowMins ?? "\u2014"} min window • resets ${formatUnixSeconds(bucket.primary?.resetsAt)}`;
    item.append(title, meta);
    wrap.append(item);
  }
  return wrap;
}

export function renderAccountPanel(
  account: CodexAccountResponse["account"],
  requiresOpenaiAuth: boolean,
  rateLimits: CodexRateLimitsResponse["rateLimits"],
  rateLimitsByLimitId: CodexRateLimitsResponse["rateLimitsByLimitId"],
  pendingLoginId: string | null,
  onPendingLoginIdChange: (loginId: string | null) => void,
  onRefresh: () => Promise<void>,
): HTMLElement {
  const actions: HTMLElement[] = [
    buildApiKeyButton(onRefresh),
    buildBrowserLoginButton(onPendingLoginIdChange, onRefresh),
  ];

  if (pendingLoginId) {
    actions.push(buildCancelLoginButton(pendingLoginId, onPendingLoginIdChange, onRefresh));
  }

  if (account) {
    actions.push(buildLogoutButton(onPendingLoginIdChange, onRefresh));
  }

  const panel = createPanel(
    "Account",
    "Host-side Codex auth state, rate-limit visibility, and native app-server login/logout actions.",
    actions,
  );

  const primaryQuota = primaryRateLimit(rateLimits, rateLimitsByLimitId);
  const metrics = document.createElement("div");
  metrics.className = "codex-admin-metrics";
  metrics.append(
    createMetric("Mode", describeAccount(account)),
    createMetric("Email", account?.email || "\u2014", account?.planType || undefined),
    createMetric("OpenAI auth", requiresOpenaiAuth ? "Required" : "Optional"),
    createMetric(
      "Primary quota",
      primaryQuota?.usedPercent !== null && primaryQuota?.usedPercent !== undefined
        ? `${primaryQuota.usedPercent}%`
        : "\u2014",
      primaryQuota.available
        ? `${primaryQuota.name} • resets ${formatUnixSeconds(primaryQuota.resetsAt)}`
        : "No rate-limit bucket reported",
    ),
  );
  panel.append(metrics);
  panel.append(renderRateLimitBuckets(rateLimits, rateLimitsByLimitId));
  return panel;
}
