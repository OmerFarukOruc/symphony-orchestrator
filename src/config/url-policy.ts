function parseUrlPolicyValue(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be a valid absolute URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new TypeError(`${label} must use https.`);
  }
  return parsed;
}

function matchesHostPattern(host: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(1);
    return host.endsWith(suffix);
  }
  return host === normalizedPattern;
}

function isHostAllowedByEnv(host: string, envName: string): boolean {
  const raw = process.env[envName] ?? "";
  if (!raw.trim()) {
    return false;
  }
  return raw.split(",").some((pattern) => matchesHostPattern(host, pattern));
}

function ensureAllowedUrl(
  value: string,
  label: string,
  envName: string,
  hostAllowed: (host: string) => boolean,
): string {
  const parsed = parseUrlPolicyValue(value, label);
  const host = parsed.hostname.toLowerCase();
  if (!hostAllowed(host) && !isHostAllowedByEnv(host, envName)) {
    throw new TypeError(`${label} host ${host} is not allowlisted.`);
  }
  return value.trim();
}

function isAllowedLinearHost(host: string): boolean {
  return host === "api.linear.app";
}

function isAllowedGitHubHost(host: string): boolean {
  return host === "api.github.com" || host === "github.com" || host.endsWith(".github.com");
}

function isAllowedSlackWebhookHost(host: string): boolean {
  return host === "hooks.slack.com" || host === "hooks.slack-gov.com";
}

function isAllowedNotificationWebhookHost(_host: string): boolean {
  return false;
}

export function normalizeTrackerEndpoint(kind: string, value: string): string {
  const envName = "RISOLUTO_ALLOWED_TRACKER_HOSTS";
  if (kind === "github") {
    return ensureAllowedUrl(value, "tracker.endpoint", envName, isAllowedGitHubHost);
  }
  return ensureAllowedUrl(value, "tracker.endpoint", envName, isAllowedLinearHost);
}

export function normalizeGitHubApiBaseUrl(value: string): string {
  return ensureAllowedUrl(value, "github.apiBaseUrl", "RISOLUTO_ALLOWED_GITHUB_API_HOSTS", isAllowedGitHubHost);
}

export function normalizeSlackWebhookUrl(value: string): string {
  return ensureAllowedUrl(
    value,
    "notifications.slack.webhookUrl",
    "RISOLUTO_ALLOWED_SLACK_WEBHOOK_HOSTS",
    isAllowedSlackWebhookHost,
  );
}

export function normalizeNotificationWebhookUrl(value: string): string {
  return ensureAllowedUrl(
    value,
    "notifications.channels[].url",
    "RISOLUTO_ALLOWED_NOTIFICATION_WEBHOOK_HOSTS",
    isAllowedNotificationWebhookHost,
  );
}
