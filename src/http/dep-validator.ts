import type { HttpRouteDeps } from "./route-types.js";

const OPTIONAL_ROUTE_DEPS: Array<{ key: keyof HttpRouteDeps; feature: string }> = [
  { key: "eventBus", feature: "/api/v1/events SSE stream" },
  { key: "tracker", feature: "tracker-backed APIs" },
  { key: "codexControlPlane", feature: "Codex admin APIs" },
  { key: "attemptStore", feature: "attempt and PR APIs" },
  { key: "notificationStore", feature: "notification APIs" },
  { key: "automationStore", feature: "automation run history APIs" },
  { key: "automationScheduler", feature: "automation APIs" },
  { key: "alertHistoryStore", feature: "alert history API" },
  { key: "templateStore", feature: "template APIs" },
  { key: "auditLogger", feature: "audit APIs" },
  { key: "configStore", feature: "configuration-backed APIs" },
  { key: "configOverlayStore", feature: "config overlay APIs" },
  { key: "secretsStore", feature: "secret-backed APIs" },
  { key: "archiveDir", feature: "setup API" },
  { key: "webhookHandlerDeps", feature: "tracker webhook receivers" },
];

function isMissing(value: unknown): boolean {
  return value === undefined || value === null;
}

export function validateHttpDeps(deps: HttpRouteDeps): void {
  for (const entry of OPTIONAL_ROUTE_DEPS) {
    if (!isMissing(deps[entry.key])) {
      continue;
    }
    deps.logger.warn({ feature: entry.feature }, "http route dependency missing; related endpoints may be unavailable");
  }

  const config = typeof deps.configStore?.getConfig === "function" ? deps.configStore.getConfig() : null;
  if (!config) {
    return;
  }

  if (config.webhook?.webhookUrl && !deps.webhookHandlerDeps) {
    throw new Error("Webhook URL is configured but webhook handler dependencies were not provided to HttpServer");
  }

  if (config.triggers?.apiKey && !deps.tracker) {
    throw new Error("Trigger API is configured but tracker dependency was not provided to HttpServer");
  }
}
